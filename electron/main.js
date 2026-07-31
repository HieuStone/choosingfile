import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win

function createWindow() {
  win = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 850,
    minHeight: 600,
    title: 'File Filter & Collector - Chọn Ảnh',
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setMenuBarVisibility(false)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  setupIpcHandlers()
  createWindow()
})

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function setupIpcHandlers() {
  // 1. Mở hộp thoại chọn thư mục
  ipcMain.handle('dialog:openDirectory', async (event, title) => {
    const result = await dialog.showOpenDialog(win, {
      title: title || 'Chọn thư mục',
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const dirPath = result.filePaths[0]
    try {
      const files = fs.readdirSync(dirPath, { withFileTypes: true })
      const fileCount = files.filter(f => f.isFile()).length
      return {
        canceled: false,
        path: dirPath,
        fileCount,
      }
    } catch (err) {
      return { canceled: false, path: dirPath, fileCount: 0, error: err.message }
    }
  })

  // 2. Quét & đối chiếu danh sách từ khóa với file trong thư mục
  ipcMain.handle('fs:scanDirectory', async (event, { sourceDir, keywords, matchMode, fileExtension }) => {
    try {
      if (!fs.existsSync(sourceDir)) {
        throw new Error('Thư mục nguồn không tồn tại!')
      }

      const allItems = fs.readdirSync(sourceDir, { withFileTypes: true })
      const files = allItems
        .filter(item => item.isFile())
        .map(item => {
          const filePath = path.join(sourceDir, item.name)
          let sizeStr = 'N/A'
          try {
            const stats = fs.statSync(filePath)
            sizeStr = formatBytes(stats.size)
          } catch (e) {}
          return {
            name: item.name,
            path: filePath,
            size: sizeStr,
            nameNoExt: path.parse(item.name).name,
          }
        })

      const matchedFilesMap = new Map()
      const matchedKeywordsSet = new Set()

      let targetExtLower = ''
      if (fileExtension && fileExtension.trim()) {
        targetExtLower = fileExtension.trim().toLowerCase()
        if (!targetExtLower.startsWith('.')) {
          targetExtLower = '.' + targetExtLower
        }
      }

      for (const kw of keywords) {
        const cleanKw = kw.trim()
        if (!cleanKw) continue

        const kwLower = cleanKw.toLowerCase()

        for (const file of files) {
          if (targetExtLower) {
            const ext = path.extname(file.name).toLowerCase()
            if (ext !== targetExtLower) continue
          }

          let isMatch = false
          const fileNameLower = file.name.toLowerCase()
          const fileNoExtLower = file.nameNoExt.toLowerCase()

          if (matchMode === 'exact-no-ext') {
            isMatch = (fileNoExtLower === kwLower)
          } else if (matchMode === 'exact-with-ext') {
            isMatch = (fileNameLower === kwLower)
          } else {
            // Mặc định: 'contains' (Khớp một phần)
            isMatch = fileNameLower.includes(kwLower)
          }

          if (isMatch) {
            matchedKeywordsSet.add(cleanKw)
            if (!matchedFilesMap.has(file.name)) {
              matchedFilesMap.set(file.name, {
                ...file,
                matchedKeywords: [cleanKw],
              })
            } else {
              const existing = matchedFilesMap.get(file.name)
              if (!existing.matchedKeywords.includes(cleanKw)) {
                existing.matchedKeywords.push(cleanKw)
              }
            }
          }
        }
      }

      const matchedFiles = Array.from(matchedFilesMap.values())
      const unmatchedKeywords = keywords.filter(kw => kw.trim() && !matchedKeywordsSet.has(kw.trim()))

      return {
        success: true,
        matchedFiles,
        unmatchedKeywords,
        totalInFolder: files.length,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Lỗi khi quét thư mục',
      }
    }
  })

  // 3. Thực hiện copy hoặc move file
  ipcMain.handle('fs:processFiles', async (event, { matchedFiles, sourceDir, destDir, operation }) => {
    try {
      let targetDir = destDir
      if (!targetDir || !targetDir.trim()) {
        const now = new Date()
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
        targetDir = path.join(sourceDir, `Filtered_Files_${timestamp}`)
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      const total = matchedFiles.length
      let current = 0
      const errors = []

      for (const file of matchedFiles) {
        try {
          const destPath = path.join(targetDir, file.name)
          if (operation === 'move') {
            fs.renameSync(file.path, destPath)
          } else {
            fs.copyFileSync(file.path, destPath)
          }
        } catch (err) {
          errors.push({ file: file.name, error: err.message })
        }

        current++
        const percent = Math.round((current / total) * 100)
        win.webContents.send('process:progress', {
          current,
          total,
          percent,
          fileName: file.name,
        })
      }

      return {
        success: true,
        targetDir,
        processedCount: current - errors.length,
        errorCount: errors.length,
        errors,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Lỗi khi xử lý file',
      }
    }
  })

  // 4. Mở thư mục kết quả
  ipcMain.handle('shell:openFolder', async (event, folderPath) => {
    try {
      await shell.openPath(folderPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
