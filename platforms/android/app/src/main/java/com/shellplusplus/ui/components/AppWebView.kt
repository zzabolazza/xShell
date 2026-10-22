package com.shellplusplus.ui.components

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebSettings
import android.webkit.*
import android.net.http.SslError
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.Modifier
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot

@SuppressLint("ClickableViewAccessibility")
@Composable
fun AppWebView(
    url: String, 
    modifier: Modifier = Modifier,
    active: Boolean = true,
    onTitleChanged: (String) -> Unit = {},
    onTwoFingerTouch: () -> Unit = {},
    onShowSwitcher: () -> Unit = {},
    onTwoFingerSwipeDown: () -> Unit = {},
    onTwoFingerSwipeUp: () -> Unit = {},
    onTwoFingerLongPress: () -> Unit = {},
    touchEnabled: Boolean = true
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    val darkTheme = isSystemInDarkTheme()
    val webViewBackground = MaterialTheme.colorScheme.background.toArgb()
    val currentOnTwoFingerTouch by rememberUpdatedState(onTwoFingerTouch)
    val currentOnShowSwitcher by rememberUpdatedState(onShowSwitcher)
    val currentOnTwoFingerSwipeDown by rememberUpdatedState(onTwoFingerSwipeDown)
    val currentOnTwoFingerSwipeUp by rememberUpdatedState(onTwoFingerSwipeUp)
    val currentOnTwoFingerLongPress by rememberUpdatedState(onTwoFingerLongPress)
    val currentTouchEnabled by rememberUpdatedState(touchEnabled)
    val context = LocalContext.current
    val chooserBridge = remember { WebChooserBridge() }

    val fileChooserLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        deliverFileChooserResult(context, chooserBridge, result.resultCode, result.data)
    }
    val chooserCameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val continuation = chooserBridge.chooserCameraContinuation
        chooserBridge.chooserCameraContinuation = null
        continuation?.invoke(granted)
    }
    val webCameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val pending = chooserBridge.pendingWebPermission
        chooserBridge.pendingWebPermission = null
        if (pending != null) {
            finishWebPermission(context, pending, granted)
        }
    }
    SideEffect {
        chooserBridge.launchChooser = { intent -> fileChooserLauncher.launch(intent) }
        chooserBridge.askChooserCamera = { continuation ->
            chooserBridge.chooserCameraContinuation = continuation
            chooserCameraLauncher.launch(android.Manifest.permission.CAMERA)
        }
        chooserBridge.askWebCamera = { request ->
            chooserBridge.pendingWebPermission?.deny()
            chooserBridge.pendingWebPermission = request
            webCameraLauncher.launch(android.Manifest.permission.CAMERA)
        }
    }

    // 处理返回键
    BackHandler(enabled = active) {
        webView?.let { view ->
            if (view.canGoBack()) {
                view.goBack()
            }
        }
    }
    
    AndroidView(
        factory = { ctx ->
            PassThroughWebView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                
                webViewClient = object : WebViewClient() {
                    @Deprecated("Deprecated in Java")
                    override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: WebResourceRequest
                    ): Boolean {
                        val urlString = request.url.toString()
                        Log.d("AppWebView", "正在加载URL: $urlString")
                        
                        // 处理Google登录相关的URL
                        if (urlString.contains("accounts.google.com") || 
                            urlString.contains("oauth") ||
                            urlString.contains("google.com/oauth")) {
                            return false // 允许Google登录相关页面正常加载
                        }
                        
                        return if (urlString.startsWith("http://")) {
                            val httpsUrl = urlString.replace("http://", "https://")
                            view.loadUrl(httpsUrl)
                            true
                        } else {
                            false
                        }
                    }

                    override fun onReceivedError(
                        view: WebView,
                        request: WebResourceRequest,
                        error: WebResourceError
                    ) {
                        Log.e("AppWebView", "页面加载错误: ${error.errorCode} - ${request.url}")
                        if (error.errorCode == ERROR_FILE_NOT_FOUND) {
                            view.reload()
                        } else {
                            super.onReceivedError(view, request, error)
                        }
                    }
                    
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d("AppWebView", "页面加载完成: $url")
                        // 页面加载完成后更新标题
                        view?.title?.let { title ->
                            if (title.isNotEmpty()) {
                                onTitleChanged(title)
                            }
                        }
                    }
                    
                    override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                        Log.w("AppWebView", "SSL错误: ${error?.toString()}")
                        // 对于Google域名，可以选择忽略SSL错误以提高兼容性
                        if (error?.url?.contains("google.com") == true) {
                            handler?.proceed()
                        } else {
                            handler?.cancel()
                        }
                    }
                }
                
                // 设置 WebChromeClient 以处理权限请求、文件选择和标题变化
                webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: PermissionRequest) {
                        handleWebPermissionRequest(ctx, chooserBridge, request)
                    }

                    override fun onShowFileChooser(
                        webView: WebView?,
                        filePathCallback: ValueCallback<Array<Uri>>?,
                        fileChooserParams: FileChooserParams?
                    ): Boolean {
                        return showWebFileChooser(ctx, chooserBridge, filePathCallback, fileChooserParams)
                    }
                    
                    override fun onReceivedTitle(view: WebView?, title: String?) {
                        super.onReceivedTitle(view, title)
                        // 当页面标题变化时，同步更新菜单栏
                        title?.let { 
                            if (it.isNotEmpty()) {
                                onTitleChanged(it)
                            }
                        }
                    }
                }
                
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    loadWithOverviewMode = true
                    useWideViewPort = true
                    // 设置缓存模式为默认缓存
                    cacheMode = WebSettings.LOAD_DEFAULT
                    // 设置UA为Chrome移动端，提高兼容性
                    userAgentString = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36"
                    // 启用 JavaScript 接口
                    javaScriptCanOpenWindowsAutomatically = true
                    // 启用媒体播放
                    mediaPlaybackRequiresUserGesture = false
                    // 优化触摸滚动
                    setSupportZoom(true)
                    builtInZoomControls = true
                    displayZoomControls = false
                    
                    // 放宽安全相关设置，提高Google登录兼容性
                    allowFileAccess = true
                    allowContentAccess = true
                    // 注意：这些设置已在较新的Android版本中弃用，但为了兼容性保留
                    // 在API 29+中，这些设置由系统自动管理
                    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
                        @Suppress("DEPRECATION")
                        allowFileAccessFromFileURLs = true
                        @Suppress("DEPRECATION")
                        allowUniversalAccessFromFileURLs = true
                    }
                    
                    // 启用现代Web特性
                    setGeolocationEnabled(true)
                    
                    // 设置混合内容处理为允许，改善Google登录兼容性
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    
                    // 启用DOM存储
                    domStorageEnabled = true
                    databaseEnabled = true
                    
                    // 启用更多Web特性以提高兼容性
                    // 注意：setAppCacheEnabled 和 setAppCachePath 已在 API 33 中移除
                    // 缓存现在由系统自动管理
                    
                    // 启用表单数据保存（在较新的Android版本中已弃用，但为了兼容性保留）
                    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) {
                        @Suppress("DEPRECATION")
                        saveFormData = true
                        @Suppress("DEPRECATION")
                        savePassword = true
                    }
                }
                applyWebViewDarkTheme(settings, darkTheme)
                setBackgroundColor(webViewBackground)
                
                // 启用第三方Cookie（使用新的API）
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                }

                // 优化触摸滚动
                isVerticalScrollBarEnabled = true
                isHorizontalScrollBarEnabled = true
                overScrollMode = android.view.View.OVER_SCROLL_IF_CONTENT_SCROLLS

                val density = ctx.resources.displayMetrics.density
                val swipeSlop = 80f * density
                val tapSlop = 25f * density
                val longPressTimeoutMs = ViewConfiguration.getLongPressTimeout().toLong()
                val gestureHandler = Handler(Looper.getMainLooper())
                var trackingSwipe = false
                var swipeIsPinch = false
                var gestureMode = 0
                var shellGestureFired = false
                var multiTouchSession = false
                var suppressUntilUp = false
                var startX0 = 0f
                var startY0 = 0f
                var startX1 = 0f
                var startY1 = 0f
                var startSpan = 1f
                var longPressArmed = false
                val longPressRunnable = Runnable {
                    if (longPressArmed && multiTouchSession && !swipeIsPinch && !shellGestureFired) {
                        longPressArmed = false
                        shellGestureFired = true
                        gestureMode = 4
                        suppressUntilUp = true
                        currentOnTwoFingerLongPress()
                        val now = android.os.SystemClock.uptimeMillis()
                        val cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0)
                        this.onTouchEvent(cancel)
                        cancel.recycle()
                    }
                }
                fun cancelLongPress() {
                    longPressArmed = false
                    gestureHandler.removeCallbacks(longPressRunnable)
                }
                setOnTouchListener { view, event ->
                    when (event.actionMasked) {
                        MotionEvent.ACTION_POINTER_DOWN -> {
                            if (event.pointerCount == 2) {
                                currentOnTwoFingerTouch()
                                startX0 = event.getX(0)
                                startY0 = event.getY(0)
                                startX1 = event.getX(1)
                                startY1 = event.getY(1)
                                startSpan = hypot(startX1 - startX0, startY1 - startY0).coerceAtLeast(1f)
                                trackingSwipe = true
                                swipeIsPinch = false
                                gestureMode = 0
                                shellGestureFired = false
                                multiTouchSession = true
                                suppressUntilUp = false
                                longPressArmed = true
                                gestureHandler.removeCallbacks(longPressRunnable)
                                gestureHandler.postDelayed(longPressRunnable, longPressTimeoutMs)
                            } else {
                                trackingSwipe = false
                                swipeIsPinch = true
                                cancelLongPress()
                            }
                        }
                        MotionEvent.ACTION_MOVE -> {
                            if (trackingSwipe && !swipeIsPinch && event.pointerCount == 2 && gestureMode == 0) {
                                val x0 = event.getX(0)
                                val y0 = event.getY(0)
                                val x1 = event.getX(1)
                                val y1 = event.getY(1)
                                val span = hypot(x1 - x0, y1 - y0)
                                val dx = (x0 + x1) / 2f - (startX0 + startX1) / 2f
                                val dy = (y0 + y1) / 2f - (startY0 + startY1) / 2f
                                val ratio = span / startSpan
                                val spanDelta = abs(span - startSpan)
                                if (hypot(dx, dy) > tapSlop || spanDelta > tapSlop) {
                                    cancelLongPress()
                                }
                                // Pinch in/out: leave both directions to WebView zoom.
                                if (ratio > 1.15f || ratio < 0.85f) {
                                    swipeIsPinch = true
                                    cancelLongPress()
                                } else {
                                    val horizontal = abs(dx) >= swipeSlop && abs(dx) > abs(dy) * 1.5f
                                    val swipeDown = dy >= swipeSlop && dy > abs(dx) * 1.5f
                                    val swipeUp = dy <= -swipeSlop && abs(dy) > abs(dx) * 1.5f
                                    if (horizontal) {
                                        gestureMode = 1
                                        shellGestureFired = true
                                        cancelLongPress()
                                        currentOnShowSwitcher()
                                    } else if (swipeDown) {
                                        gestureMode = 2
                                        shellGestureFired = true
                                        cancelLongPress()
                                        currentOnTwoFingerSwipeDown()
                                    } else if (swipeUp) {
                                        gestureMode = 3
                                        shellGestureFired = true
                                        cancelLongPress()
                                        (view as? WebView)?.reload()
                                        currentOnTwoFingerSwipeUp()
                                    }
                                }
                            }
                        }
                    }
                    when (event.actionMasked) {
                        MotionEvent.ACTION_POINTER_UP -> {
                            if (event.pointerCount <= 2) {
                                trackingSwipe = false
                                cancelLongPress()
                                // Non-pinch multitouch: eat the rest of this stream so the
                                // primary finger cannot finish as a page click/drag.
                                if (multiTouchSession && !swipeIsPinch) {
                                    suppressUntilUp = true
                                }
                                gestureMode = 0
                            }
                        }
                        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                            cancelLongPress()
                            trackingSwipe = false
                            gestureMode = 0
                            shellGestureFired = false
                            val suppressClick =
                                event.actionMasked == MotionEvent.ACTION_UP &&
                                    (suppressUntilUp || (multiTouchSession && !swipeIsPinch))
                            multiTouchSession = false
                            swipeIsPinch = false
                            suppressUntilUp = false
                            val blockPage = !currentTouchEnabled
                            return@setOnTouchListener suppressClick || blockPage
                        }
                    }
                    val blockPage = !currentTouchEnabled
                    // After a shell gesture fires, keep consuming until fingers lift.
                    // Forward undecided/pinch moves so zoom still works; once a non-pinch
                    // multitouch lift starts, swallow the remainder to prevent page clicks.
                    gestureMode != 0 || shellGestureFired || blockPage || suppressUntilUp
                }
                
                tag = url
                loadUrl(url)
                
                // 保存WebView引用
                webView = this
            }
        },
        update = { webViewInstance ->
            val passThrough = webViewInstance as PassThroughWebView
            applyWebViewDarkTheme(webViewInstance.settings, darkTheme)
            webViewInstance.setBackgroundColor(webViewBackground)
            val themeChanged = passThrough.appliedDarkTheme != null &&
                passThrough.appliedDarkTheme != darkTheme
            passThrough.appliedDarkTheme = darkTheme
            if (webViewInstance.tag != url) {
                webViewInstance.tag = url
                webViewInstance.loadUrl(url)
            } else if (themeChanged) {
                webViewInstance.reload()
            }
            webViewInstance.visibility = if (active) android.view.View.VISIBLE else android.view.View.INVISIBLE
            passThrough.touchEnabled = currentTouchEnabled
            webView = webViewInstance
        },
        onRelease = {
            chooserBridge.fileCallback?.onReceiveValue(null)
            chooserBridge.fileCallback = null
            chooserBridge.pendingWebPermission?.deny()
            chooserBridge.pendingWebPermission = null
            it.destroy()
        },
        modifier = modifier
    )
}

private class PassThroughWebView(context: Context) : WebView(context) {
    var touchEnabled: Boolean = true
    var appliedDarkTheme: Boolean? = null

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (!touchEnabled) return false
        return super.dispatchTouchEvent(ev)
    }
}

private class WebChooserBridge {
    var fileCallback: ValueCallback<Array<Uri>>? = null
    var cameraUris: List<Uri> = emptyList()
    var launchChooser: ((Intent) -> Unit)? = null
    var askChooserCamera: (((Boolean) -> Unit) -> Unit)? = null
    var chooserCameraContinuation: ((Boolean) -> Unit)? = null
    var askWebCamera: ((PermissionRequest) -> Unit)? = null
    var pendingWebPermission: PermissionRequest? = null
}

private fun handleWebPermissionRequest(
    context: Context,
    bridge: WebChooserBridge,
    request: PermissionRequest
) {
    val wantsVideo = PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources
    if (!wantsVideo) {
        finishWebPermission(context, request, cameraGranted = false)
        return
    }
    if (hasPermission(context, android.Manifest.permission.CAMERA)) {
        finishWebPermission(context, request, cameraGranted = true)
        return
    }
    val ask = bridge.askWebCamera
    if (ask == null) {
        finishWebPermission(context, request, cameraGranted = false)
        return
    }
    ask(request)
}

private fun finishWebPermission(context: Context, request: PermissionRequest, cameraGranted: Boolean) {
    val granted = request.resources.filter { resource ->
        when (resource) {
            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> cameraGranted
            PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                hasPermission(context, android.Manifest.permission.RECORD_AUDIO)
            else -> true
        }
    }
    if (granted.isEmpty()) {
        request.deny()
    } else {
        request.grant(granted.toTypedArray())
    }
}

private fun showWebFileChooser(
    context: Context,
    bridge: WebChooserBridge,
    filePathCallback: ValueCallback<Array<Uri>>?,
    fileChooserParams: WebChromeClient.FileChooserParams?
): Boolean {
    bridge.fileCallback?.onReceiveValue(null)
    bridge.fileCallback = filePathCallback
    bridge.cameraUris = emptyList()

    val acceptTypes = fileChooserParams?.acceptTypes
        ?.map { it.trim() }
        ?.filter { it.isNotEmpty() }
        .orEmpty()
    val wantsImage = acceptTypes.any { it.startsWith("image", ignoreCase = true) }
    val wantsVideo = acceptTypes.any { it.startsWith("video", ignoreCase = true) }
    val capture = fileChooserParams?.isCaptureEnabled == true
    val includeImageCamera = wantsImage || (capture && !wantsVideo)
    val includeVideoCamera = wantsVideo
    val wantsCamera = (includeImageCamera || includeVideoCamera) &&
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

    fun openChooser(withCamera: Boolean) {
        val chooser = buildFileChooserIntent(
            context = context,
            acceptTypes = acceptTypes,
            allowMultiple = fileChooserParams?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE,
            includeImageCamera = withCamera && includeImageCamera,
            includeVideoCamera = withCamera && includeVideoCamera
        )
        bridge.cameraUris = chooser.second
        val launch = bridge.launchChooser
        if (launch == null) {
            bridge.fileCallback?.onReceiveValue(null)
            bridge.fileCallback = null
            bridge.cameraUris = emptyList()
            return
        }
        try {
            launch(chooser.first)
        } catch (error: Exception) {
            Log.e("AppWebView", "无法打开文件选择器", error)
            bridge.fileCallback?.onReceiveValue(null)
            bridge.fileCallback = null
            bridge.cameraUris = emptyList()
        }
    }

    if (wantsCamera && !hasPermission(context, android.Manifest.permission.CAMERA)) {
        val ask = bridge.askChooserCamera
        if (ask == null) {
            openChooser(withCamera = false)
        } else {
            ask { granted -> openChooser(withCamera = granted) }
        }
    } else {
        openChooser(withCamera = wantsCamera)
    }
    return true
}

private fun buildFileChooserIntent(
    context: Context,
    acceptTypes: List<String>,
    allowMultiple: Boolean,
    includeImageCamera: Boolean,
    includeVideoCamera: Boolean
): Pair<Intent, List<Uri>> {
    val mimeTypes = acceptTypes.mapNotNull { normalizeMime(it) }
    val content = Intent(Intent.ACTION_GET_CONTENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = when {
            mimeTypes.size == 1 -> mimeTypes[0]
            else -> "*/*"
        }
        if (mimeTypes.size > 1) {
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
        }
        if (allowMultiple) {
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
    }
    val cameraIntents = mutableListOf<Intent>()
    val cameraUris = mutableListOf<Uri>()
    if (includeImageCamera) {
        createCaptureIntent(context, image = true)?.let { (intent, uri) ->
            cameraIntents += intent
            cameraUris += uri
        }
    }
    if (includeVideoCamera) {
        createCaptureIntent(context, image = false)?.let { (intent, uri) ->
            cameraIntents += intent
            cameraUris += uri
        }
    }
    val chooser = Intent.createChooser(content, null)
    if (cameraIntents.isNotEmpty()) {
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, cameraIntents.toTypedArray())
    }
    return chooser to cameraUris
}

private fun createCaptureIntent(context: Context, image: Boolean): Pair<Intent, Uri>? {
    val extension = if (image) "jpg" else "mp4"
    val directory = File(context.cacheDir, "capture")
    if (!directory.exists() && !directory.mkdirs()) return null
    val file = File(directory, "${System.currentTimeMillis()}.$extension")
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val action = if (image) MediaStore.ACTION_IMAGE_CAPTURE else MediaStore.ACTION_VIDEO_CAPTURE
    val intent = Intent(action).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        clipData = ClipData.newUri(context.contentResolver, "capture", uri)
    }
    val resolved = context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
    if (resolved.isEmpty()) return null
    val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    resolved.forEach { info ->
        context.grantUriPermission(info.activityInfo.packageName, uri, flags)
    }
    return intent to uri
}

private fun deliverFileChooserResult(
    context: Context,
    bridge: WebChooserBridge,
    resultCode: Int,
    data: Intent?
) {
    val callback = bridge.fileCallback
    val cameraUris = bridge.cameraUris
    bridge.fileCallback = null
    bridge.cameraUris = emptyList()
    if (callback == null) return
    if (resultCode != Activity.RESULT_OK) {
        callback.onReceiveValue(null)
        return
    }
    val picked = mutableListOf<Uri>()
    data?.clipData?.let { clip ->
        for (index in 0 until clip.itemCount) {
            clip.getItemAt(index)?.uri?.let { picked += it }
        }
    }
    data?.data?.let { uri ->
        if (uri !in picked) picked += uri
    }
    if (picked.isEmpty()) {
        cameraUris.filter { uriHasContent(context, it) }.forEach { picked += it }
    }
    callback.onReceiveValue(picked.takeIf { it.isNotEmpty() }?.toTypedArray())
}

private fun normalizeMime(raw: String): String? {
    val value = raw.trim()
    if (!value.contains("/")) return null
    return value
}

private fun uriHasContent(context: Context, uri: Uri): Boolean {
    return try {
        context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize > 0L } == true
    } catch (error: Exception) {
        false
    }
}

private fun hasPermission(context: Context, permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}
