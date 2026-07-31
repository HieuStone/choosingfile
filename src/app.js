// State của ứng dụng
const state = {
  sourceDir: null,
  destDir: null,
  keywords: [],
  matchMode: 'contains',
  operation: 'copy',
  scannedResults: null,
  lastProcessedDir: null,
  fileExtension: '',
}

// DOM Elements
const btnSelectSource = document.getElementById('btn-select-source')
const sourcePathDisplay = document.getElementById('source-path-display')
const sourceFileCount = document.getElementById('source-file-count')

const keywordsInput = document.getElementById('keywords-input')
const keywordCountBadge = document.getElementById('keyword-count-badge')
const extFilterInput = document.getElementById('ext-filter-input')

const radioMatchModes = document.querySelectorAll('input[name="match-mode"]')
const radioOperations = document.querySelectorAll('input[name="operation"]')
const lblOpCopy = document.getElementById('lbl-op-copy')
const lblOpMove = document.getElementById('lbl-op-move')

const btnSelectDest = document.getElementById('btn-select-dest')
const destPathDisplay = document.getElementById('dest-path-display')

const btnScan = document.getElementById('btn-scan')
const emptyState = document.getElementById('empty-state')
const resultsContent = document.getElementById('results-content')

const matchedFileCount = document.getElementById('matched-file-count')
const unmatchedKwCount = document.getElementById('unmatched-kw-count')
const tabCountMatched = document.getElementById('tab-count-matched')
const tabCountUnmatched = document.getElementById('tab-count-unmatched')

const tabBtns = document.querySelectorAll('.tab-btn')
const tabPanes = document.querySelectorAll('.tab-pane')

const tableMatchedBody = document.getElementById('table-matched-body')
const unmatchedTagsContainer = document.getElementById('unmatched-tags-container')

const progressContainer = document.getElementById('progress-container')
const progressBarFill = document.getElementById('progress-bar-fill')
const progressPercentText = document.getElementById('progress-percent-text')
const progressStatusText = document.getElementById('progress-status-text')

const btnExecute = document.getElementById('btn-execute')
const completionBanner = document.getElementById('completion-banner')
const completionSummaryText = document.getElementById('completion-summary-text')
const btnOpenFolder = document.getElementById('btn-open-folder')

// 1. Phân tích từ khóa đầu vào
function parseKeywords(text) {
  if (!text || !text.trim()) return []
  // Phân cách bởi xuống dòng, dấu phẩy, hoặc tab
  const separatorRegex = /[\r\n,\t]+/
  let items
  if (separatorRegex.test(text)) {
    items = text.split(separatorRegex)
  } else {
    // Nếu không có dấu phẩy hay xuống dòng thì tách theo khoảng trắng
    items = text.split(/\s+/)
  }
  return [...new Set(items.map(s => s.trim()).filter(Boolean))]
}

keywordsInput.addEventListener('input', () => {
  state.keywords = parseKeywords(keywordsInput.value)
  keywordCountBadge.textContent = `${state.keywords.length} từ khóa`
})

extFilterInput.addEventListener('input', () => {
  state.fileExtension = extFilterInput.value.trim()
})

// 2. Tùy chọn Match Mode
radioMatchModes.forEach(radio => {
  radio.addEventListener('change', (e) => {
    state.matchMode = e.target.value
    document.querySelectorAll('.radio-card').forEach(card => card.classList.remove('active'))
    e.target.closest('.radio-card').classList.add('active')
  })
})

// 3. Tùy chọn Operation (Copy/Move)
radioOperations.forEach(radio => {
  radio.addEventListener('change', (e) => {
    state.operation = e.target.value
    lblOpCopy.classList.toggle('active', state.operation === 'copy')
    lblOpMove.classList.toggle('active', state.operation === 'move')
    
    if (state.scannedResults) {
      updateExecuteButtonText()
    }
  })
})

function updateExecuteButtonText() {
  const count = state.scannedResults ? state.scannedResults.matchedFiles.length : 0
  const actionName = state.operation === 'copy' ? 'Copy File' : 'Move File'
  btnExecute.innerHTML = `<span class="icon">✨</span> Thực Hiện ${actionName} (${count} file)`
  btnExecute.disabled = count === 0
  btnExecute.classList.toggle('btn-success', state.operation === 'copy')
  btnExecute.classList.toggle('btn-primary', state.operation === 'move')
}

// 4. Chọn thư mục nguồn
btnSelectSource.addEventListener('click', async () => {
  const res = await window.api.openDirectory('Chọn Thư Mục Nguồn')
  if (!res.canceled && res.path) {
    state.sourceDir = res.path
    sourcePathDisplay.innerHTML = `<strong>${res.path}</strong>`
    sourceFileCount.textContent = res.fileCount
  }
})

// 5. Chọn thư mục đích
btnSelectDest.addEventListener('click', async () => {
  const res = await window.api.openDirectory('Chọn Thư Mục Đích')
  if (!res.canceled && res.path) {
    state.destDir = res.path
    destPathDisplay.innerHTML = `<strong>${res.path}</strong>`
  }
})

// 6. Quét thư mục & đối chiếu
btnScan.addEventListener('click', async () => {
  if (!state.sourceDir) {
    alert('Vui lòng chọn Thư mục nguồn trước!')
    return
  }
  if (state.keywords.length === 0) {
    alert('Vui lòng nhập hoặc dán ít nhất 1 từ khóa / tên file cần tìm!')
    return
  }

  btnScan.disabled = true
  btnScan.innerHTML = `<span class="icon">🔄</span> Đang quét dữ liệu...`

  try {
    const res = await window.api.scanDirectory({
      sourceDir: state.sourceDir,
      keywords: state.keywords,
      matchMode: state.matchMode,
      fileExtension: state.fileExtension,
    })

    if (!res.success) {
      alert(`Lỗi khi quét: ${res.error}`)
      return
    }

    state.scannedResults = res
    renderResults(res)
  } catch (err) {
    alert(`Đã xảy ra lỗi: ${err.message}`)
  } finally {
    btnScan.disabled = false
    btnScan.innerHTML = `<span class="icon">⚡</span> Quét & Đối Chiếu Dữ Liệu`
  }
})

function renderResults(res) {
  emptyState.classList.add('hidden')
  resultsContent.classList.remove('hidden')
  progressContainer.classList.add('hidden')
  completionBanner.classList.add('hidden')
  btnExecute.classList.remove('hidden')

  // Cập nhật con số thống kê
  const matchedCount = res.matchedFiles.length
  const unmatchedCount = res.unmatchedKeywords.length

  matchedFileCount.textContent = matchedCount
  unmatchedKwCount.textContent = unmatchedCount
  tabCountMatched.textContent = matchedCount
  tabCountUnmatched.textContent = unmatchedCount

  // Bảng File khớp
  tableMatchedBody.innerHTML = ''
  if (matchedCount === 0) {
    tableMatchedBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 20px;">Không tìm thấy file nào khớp với từ khóa trong thư mục này.</td></tr>`
  } else {
    res.matchedFiles.forEach((file, index) => {
      const tr = document.createElement('tr')
      const tagsHtml = file.matchedKeywords.map(kw => `<span class="tag">${kw}</span>`).join(' ')
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${file.name}</strong></td>
        <td>${file.size}</td>
        <td>${tagsHtml}</td>
      `
      tableMatchedBody.appendChild(tr)
    })
  }

  // Bảng Từ khóa thiếu
  unmatchedTagsContainer.innerHTML = ''
  if (unmatchedCount === 0) {
    unmatchedTagsContainer.innerHTML = `<p style="color: #10b981; font-weight: 600; padding: 10px 0;">🎉 Tuyệt vời! Tất cả ${state.keywords.length} từ khóa đều đã tìm thấy file tương ứng trong thư mục.</p>`
  } else {
    res.unmatchedKeywords.forEach(kw => {
      const span = document.createElement('span')
      span.className = 'tag-unmatched'
      span.innerHTML = `❌ <span>${kw}</span>`
      unmatchedTagsContainer.appendChild(span)
    })
  }

  updateExecuteButtonText()
}

// 7. Chuyển đổi Tab
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab')
    tabBtns.forEach(b => b.classList.remove('active'))
    tabPanes.forEach(p => p.classList.remove('active'))

    btn.classList.add('active')
    document.getElementById(targetTab).classList.add('active')
  })
})

// 8. Thực hiện Copy / Move file
btnExecute.addEventListener('click', async () => {
  if (!state.scannedResults || state.scannedResults.matchedFiles.length === 0) return

  const actionName = state.operation === 'copy' ? 'sao chép' : 'di chuyển'
  const confirmMsg = `Bạn có chắc chắn muốn ${actionName} ${state.scannedResults.matchedFiles.length} file đã chọn sang thư mục mới?`
  if (!confirm(confirmMsg)) return

  btnExecute.classList.add('hidden')
  progressContainer.classList.remove('hidden')
  completionBanner.classList.add('hidden')

  progressBarFill.style.width = '0%'
  progressPercentText.textContent = '0%'
  progressStatusText.textContent = `Đang chuẩn bị ${actionName}...`

  // Đăng ký nhận sự kiện tiến độ từ Main Process
  const unsubscribe = window.api.onProgress((data) => {
    progressBarFill.style.width = `${data.percent}%`
    progressPercentText.textContent = `${data.percent}%`
    progressStatusText.textContent = `Đang xử lý: ${data.fileName} (${data.current}/${data.total})`
  })

  try {
    const res = await window.api.processFiles({
      matchedFiles: state.scannedResults.matchedFiles,
      sourceDir: state.sourceDir,
      destDir: state.destDir,
      operation: state.operation,
    })

    unsubscribe()

    if (res.success) {
      progressBarFill.style.width = '100%'
      progressPercentText.textContent = '100%'
      progressStatusText.textContent = `Hoàn tất!`

      state.lastProcessedDir = res.targetDir
      completionSummaryText.innerHTML = `Đã ${actionName} thành công <strong>${res.processedCount}</strong> file vào thư mục:<br><code style="color: #67e8f9; font-size: 11px;">${res.targetDir}</code>`
      completionBanner.classList.remove('hidden')

      // Nếu là move file, quét lại vì file trong mục gốc đã bị di chuyển đi
      if (state.operation === 'move') {
        setTimeout(() => {
          btnScan.click()
        }, 1500)
      }
    } else {
      alert(`Lỗi khi xử lý file: ${res.error}`)
      btnExecute.classList.remove('hidden')
      progressContainer.classList.add('hidden')
    }
  } catch (err) {
    unsubscribe()
    alert(`Lỗi: ${err.message}`)
    btnExecute.classList.remove('hidden')
    progressContainer.classList.add('hidden')
  }
})

// 9. Mở thư mục kết quả
btnOpenFolder.addEventListener('click', async () => {
  if (state.lastProcessedDir) {
    await window.api.openFolder(state.lastProcessedDir)
  }
})
