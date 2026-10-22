package com.shellplusplus.ui.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.zIndex
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerEventType
import kotlin.math.abs
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.shellplusplus.data.AppInfo
import com.shellplusplus.ui.components.AppWebView
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import coil.request.ImageRequest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    viewModel: MainViewModel = hiltViewModel()
) {
    val apps by viewModel.apps.collectAsState()
    val openedApps by viewModel.openedApps.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val selectedApp by viewModel.selectedApp.collectAsState()
    val scope = rememberCoroutineScope()
    var switcherIndex by remember { mutableStateOf<Int?>(null) }
    var displayedSwitcherIndex by remember { mutableIntStateOf(0) }
    var showingLauncher by remember { mutableStateOf(false) }
    
    // 当前页面标题状态
    var pageTitles by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val currentPageTitle = selectedApp?.packageName?.let { pageTitles[it] }
    
    // 顶部菜单栏自动隐藏状态
    var isTopBarVisible by remember { mutableStateOf(true) }
    var topBarHideJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    
    // 自动隐藏顶部菜单栏的函数
    fun hideTopBarAfterDelay() {
        topBarHideJob?.cancel()
        topBarHideJob = scope.launch {
            kotlinx.coroutines.delay(3000)
            isTopBarVisible = false
        }
    }

    fun showTopBar() {
        isTopBarVisible = true
        hideTopBarAfterDelay()
    }

    LaunchedEffect(Unit) {
        hideTopBarAfterDelay()
    }

    val browsing = selectedApp != null && !showingLauncher

    Scaffold(
        topBar = {
            if (isTopBarVisible) {
                Column {
                    TopAppBar(
                        title = {
                            Text(
                                text = if (browsing) {
                                    currentPageTitle ?: selectedApp?.name ?: "Shell++"
                                } else {
                                    "Shell++"
                                },
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        },
                        actions = {
                            IconButton(
                                onClick = { viewModel.showConfigDialog() }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Settings,
                                    contentDescription = "配置"
                                )
                            }
                        }
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(MaterialTheme.colorScheme.outlineVariant)
                    )
                }
            }
        }
    ) { innerPadding ->
        val openedAppsState = rememberUpdatedState(openedApps)
        val selectedPackageState = rememberUpdatedState(selectedApp?.packageName)
        val switcherOpenState = rememberUpdatedState(switcherIndex != null)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .pointerInput(Unit) {
                    val swipeSlop = 80.dp.toPx()
                    var tracking = false
                    var fired = false
                    var startX = 0f
                    var startY = 0f
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Initial)
                            val pressed = event.changes.filter { it.pressed }
                            if (pressed.size >= 2) {
                                if (!tracking) {
                                    showTopBar()
                                    val first = pressed[0].position
                                    val second = pressed[1].position
                                    startX = (first.x + second.x) / 2f
                                    startY = (first.y + second.y) / 2f
                                    tracking = true
                                    fired = false
                                } else if (!fired && event.type == PointerEventType.Move) {
                                    val first = pressed[0].position
                                    val second = pressed[1].position
                                    val dx = (first.x + second.x) / 2f - startX
                                    val dy = (first.y + second.y) / 2f - startY
                                    if (abs(dx) >= swipeSlop && abs(dx) > abs(dy) * 1.5f) {
                                        fired = true
                                        val appsNow = openedAppsState.value
                                        if (appsNow.size > 1 && !switcherOpenState.value) {
                                            val current = appsNow.indexOfFirst {
                                                it.packageName == selectedPackageState.value
                                            }.coerceAtLeast(0)
                                            switcherIndex = current
                                            displayedSwitcherIndex = current
                                        }
                                    }
                                }
                            } else {
                                tracking = false
                                fired = false
                            }
                        }
                    }
                }
        ) {
            if (selectedApp != null) {
                openedApps.forEach { app ->
                    key(app.packageName) {
                        val active = browsing && app.packageName == selectedApp?.packageName
                        AppWebView(
                            url = app.url,
                            active = active,
                            modifier = Modifier
                                .fillMaxSize()
                                .zIndex(if (active) 1f else 0f),
                            onTitleChanged = { title ->
                                pageTitles = pageTitles + (app.packageName to title)
                            },
                            onTwoFingerTouch = { showTopBar() },
                            touchEnabled = browsing && switcherIndex == null,
                            onShowSwitcher = {
                                if (openedApps.size > 1 && switcherIndex == null) {
                                    val current = openedApps.indexOfFirst {
                                        it.packageName == selectedApp?.packageName
                                    }.coerceAtLeast(0)
                                    switcherIndex = current
                                    displayedSwitcherIndex = current
                                }
                            },
                            onTwoFingerSwipeDown = {
                                if (selectedApp != null) {
                                    switcherIndex = null
                                    showingLauncher = false
                                    viewModel.closeSelectedApp()
                                    showTopBar()
                                }
                            },
                            onTwoFingerSwipeUp = {
                                showTopBar()
                            },
                            onTwoFingerLongPress = {
                                switcherIndex = null
                                showingLauncher = true
                                showTopBar()
                            }
                        )
                    }
                }
            }
            if (!browsing) {
                AppLauncherGrid(
                    apps = apps,
                    isLoading = isLoading,
                    selectedPackage = selectedApp?.packageName,
                    onSelect = { app ->
                        viewModel.selectApp(app)
                        showingLauncher = false
                        showTopBar()
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .zIndex(2f)
                )
            }
            AnimatedVisibility(
                visible = switcherIndex != null && openedApps.size > 1,
                enter = fadeIn(tween(200)),
                exit = fadeOut(tween(200)),
                modifier = Modifier
                    .fillMaxSize()
                    .zIndex(3f)
            ) {
                OpenAppSwitcher(
                    apps = openedApps,
                    selectedIndex = displayedSwitcherIndex,
                    onSelect = { app ->
                        viewModel.selectApp(app)
                        showingLauncher = false
                        showTopBar()
                        switcherIndex = null
                    },
                    onDismiss = { switcherIndex = null }
                )
            }
        }
    }
        
        val showConfigDialog by viewModel.showConfigDialog.collectAsState()
        val sourceUrl by viewModel.sourceUrl.collectAsState()
        if (showConfigDialog) {
            var sourceText by remember(sourceUrl) { mutableStateOf(sourceUrl) }
            AlertDialog(
                onDismissRequest = { viewModel.hideConfigDialog() },
                title = { Text("应用列表源") },
                text = {
                    OutlinedTextField(
                        value = sourceText,
                        onValueChange = { sourceText = it },
                        label = { Text("源地址") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth()
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = { viewModel.saveSourceUrl(sourceText) },
                        enabled = sourceText.isNotBlank()
                    ) {
                        Text("保存")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { viewModel.hideConfigDialog() }) {
                        Text("取消")
                    }
                }
            )
        }
}

@Composable
private fun OpenAppSwitcher(
    apps: List<AppInfo>,
    selectedIndex: Int,
    onSelect: (AppInfo) -> Unit,
    onDismiss: () -> Unit
) {
    val dismissInteraction = remember { MutableInteractionSource() }
    val cardInteraction = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.28f))
            .clickable(
                interactionSource = dismissInteraction,
                indication = null,
                onClick = onDismiss
            ),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp,
            modifier = Modifier
                .padding(horizontal = 24.dp)
                .fillMaxWidth()
                .widthIn(max = 360.dp)
                .clickable(
                    interactionSource = cardInteraction,
                    indication = null,
                    onClick = {}
                )
        ) {
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top
            ) {
                apps.forEachIndexed { index, app ->
                    SwitcherAppIcon(
                        app = app,
                        selected = index == selectedIndex,
                        onClick = { onSelect(app) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SwitcherAppIcon(
    app: AppInfo,
    selected: Boolean,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val faviconUrl = faviconUrlFor(app.url)
    val imageRequest = remember(faviconUrl) {
        ImageRequest.Builder(context)
            .data(faviconUrl)
            .allowHardware(false)
            .build()
    }
    val scale = remember { Animatable(1f) }
    LaunchedEffect(selected) {
        if (selected) {
            scale.snapTo(1f)
            scale.animateTo(
                1.15f,
                keyframes {
                    durationMillis = 300
                    1f at 0
                    1.2f at 150
                    1.15f at 300
                }
            )
        } else {
            scale.animateTo(1f, tween(300))
        }
    }
    val alpha by animateFloatAsState(
        targetValue = if (selected) 1f else 0.6f,
        animationSpec = tween(300),
        label = "switcherAlpha"
    )

    Column(
        modifier = Modifier
            .width(80.dp)
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
                this.alpha = alpha
            }
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = imageRequest,
                contentDescription = app.name,
                modifier = Modifier.size(36.dp),
                contentScale = ContentScale.Fit
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = app.name,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun AppLauncherGrid(
    apps: List<AppInfo>,
    isLoading: Boolean,
    selectedPackage: String?,
    onSelect: (AppInfo) -> Unit,
    modifier: Modifier = Modifier
) {
    if (isLoading && apps.isEmpty()) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator()
        }
        return
    }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(108.dp),
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            items = apps,
            key = { it.packageName }
        ) { app ->
            AppItem(
                app = app,
                isSelected = app.packageName == selectedPackage,
                onClick = { onSelect(app) }
            )
        }
    }
}

@Composable
fun AppItem(
    app: AppInfo,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val faviconUrl = faviconUrlFor(app.url)
    val logoColor = rememberLogoColor(app.url)
    val selectedBackground = lerp(MaterialTheme.colorScheme.surface, logoColor, 0.16f)
    val imageRequest = remember(faviconUrl) {
        ImageRequest.Builder(context)
            .data(faviconUrl)
            .allowHardware(false)
            .build()
    }

    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (isSelected) selectedBackground else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier.size(64.dp),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = imageRequest,
                contentDescription = "${app.name} 图标",
                modifier = Modifier.size(40.dp),
                contentScale = ContentScale.Fit
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = app.name,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

