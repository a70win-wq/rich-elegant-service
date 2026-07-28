#!/bin/bash
# ========================================
# 雅博工程公司官網 - 一鍵啟動
# ========================================
# 用法：雙擊呢個檔案，或者喺終端機輸入:
#   bash start.sh
# ========================================

echo ""
echo "========================================"
echo "  雅博工程公司官網 - 啟動中..."
echo "========================================"
echo ""

# 檢查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安裝 Node.js！"
    echo ""
    echo "請先去 https://nodejs.org 下載安裝 Node.js"
    echo "安裝完之後再運行呢個腳本"
    echo ""
    read -p "按 Enter 鍵離開..."
    exit 1
fi

# 檢查依賴
if [ ! -d "node_modules" ]; then
    echo "📦 第一次運行，安裝依賴中..."
    npm install --silent
    echo ""
fi

echo "🚀 啟動伺服器..."
echo ""
node server.js
