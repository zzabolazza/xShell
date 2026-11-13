@echo off
echo 正在启动 xShell Website 开发服务器...
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
    if errorlevel 1 (
        echo 依赖安装失败！
        pause
        exit /b 1
    )
    echo 依赖安装完成！
    echo.
)

echo 启动开发服务器...
echo 访问地址: http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.

npm run dev
pause
