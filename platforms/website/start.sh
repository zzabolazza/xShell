#!/bin/bash

echo "正在启动 xShell Website 开发服务器..."
echo

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "依赖安装失败！"
        exit 1
    fi
    echo "依赖安装完成！"
    echo
fi

echo "启动开发服务器..."
echo "访问地址: http://localhost:3000"
echo "按 Ctrl+C 停止服务器"
echo

npm run dev
