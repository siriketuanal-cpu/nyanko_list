package com.aistudio.nyankocheck

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aistudio.nyankocheck.data.AccountEntity
import com.aistudio.nyankocheck.data.AppDatabase
import com.aistudio.nyankocheck.data.CheckItemEntity
import com.aistudio.nyankocheck.data.GameEntity
import com.aistudio.nyankocheck.data.NyankoPreferences
import com.aistudio.nyankocheck.data.NyankoRepository
import com.aistudio.nyankocheck.ui.NyankoViewModel
import com.aistudio.nyankocheck.ui.NyankoViewModelFactory

class MainActivity : ComponentActivity() {
    private val viewModel: NyankoViewModel by viewModels {
        val db = AppDatabase.getDatabase(applicationContext)
        val prefs = NyankoPreferences(applicationContext)
        val repo = NyankoRepository(db, prefs)
        NyankoViewModelFactory(repo, SavedStateHandle())
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFFEC407A),          // Soft Pink
                    onPrimary = Color.White,
                    primaryContainer = Color(0xFFFCE4EC),    // Light Pink container
                    onPrimaryContainer = Color(0xFF880E4F),
                    secondary = Color(0xFFFF7043),        // Warm Coral/Orange
                    background = Color(0xFFFFF9FA),       // Warm clean white-pink
                    surface = Color.White,
                    onSurface = Color(0xFF2C3E50),
                    surfaceVariant = Color(0xFFF8EAF0)
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    NyankoCheckApp(viewModel)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NyankoCheckApp(viewModel: NyankoViewModel) {
    val games by viewModel.games.collectAsStateWithLifecycle()
    val accounts by viewModel.accounts.collectAsStateWithLifecycle()
    val checkItems by viewModel.checkItems.collectAsStateWithLifecycle()

    val selectedGameId by viewModel.selectedGameId.collectAsStateWithLifecycle()
    val selectedAccountId by viewModel.selectedAccountId.collectAsStateWithLifecycle()
    val selectedTabIdx by viewModel.selectedTabIndex.collectAsStateWithLifecycle()

    // Lifecycle Observer: executes safe auto-reset on resume
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.onResume()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Auto-fallback selection if saved ID is no longer valid
    LaunchedEffect(games, selectedGameId) {
        if (games.isNotEmpty()) {
            if (selectedGameId == null || games.none { it.id == selectedGameId }) {
                viewModel.selectGame(games.first().id)
            }
        }
    }
    LaunchedEffect(accounts, selectedAccountId) {
        if (accounts.isNotEmpty()) {
            if (selectedAccountId == null || accounts.none { it.id == selectedAccountId }) {
                viewModel.selectAccount(accounts.first().id)
            }
        }
    }

    // Dialog States
    var showAddGameDialog by remember { mutableStateOf(false) }
    var showAddAccountDialog by remember { mutableStateOf(false) }
    var showAddItemDialog by remember { mutableStateOf(false) }
    var showResetConfirmDialog by remember { mutableStateOf(false) }
    var gameToDelete by remember { mutableStateOf<GameEntity?>(null) }
    var accountToDelete by remember { mutableStateOf<AccountEntity?>(null) }

    var gameNameInput by remember { mutableStateOf("") }
    var gameResetTimeInput by remember { mutableStateOf("05:00") }
    var accountNameInput by remember { mutableStateOf("") }
    var checkItemLabelInput by remember { mutableStateOf("") }

    val categories = remember {
        listOf(
            "daily" to "デイリー",
            "weekly" to "ウィークリー",
            "monthly" to "マンスリー",
            "misc" to "その他"
        )
    }
    val currentCategoryPair = categories.getOrElse(selectedTabIdx) { categories[0] }
    val currentCategoryType = currentCategoryPair.first
    val currentCategoryName = currentCategoryPair.second

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "🐾 にゃんこチェック",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        },
        floatingActionButton = {
            if (selectedAccountId != null) {
                FloatingActionButton(
                    onClick = { showAddItemDialog = true },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.semantics { contentDescription = "チェック項目の追加" }
                ) {
                    Icon(imageVector = Icons.Default.Add, contentDescription = null)
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            // 1. SELECT GAME & SELECT ACCOUNT SECTION
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f)
                ),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Game Selector Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "対象ゲーム:",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (games.isNotEmpty()) {
                                var expandedGames by remember { mutableStateOf(false) }
                                val selectedGame = remember(games, selectedGameId) {
                                    games.find { it.id == selectedGameId }
                                }
                                Button(
                                    onClick = { expandedGames = true },
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        selectedGame?.name ?: "選択してください",
                                        maxLines = 1
                                    )
                                }
                                DropdownMenu(
                                    expanded = expandedGames,
                                    onDismissRequest = { expandedGames = false }
                                ) {
                                    games.forEach { g ->
                                        DropdownMenuItem(
                                            text = { Text(g.name) },
                                            onClick = {
                                                viewModel.selectGame(g.id)
                                                expandedGames = false
                                            }
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(4.dp))
                                selectedGame?.let { g ->
                                    IconButton(
                                        onClick = { gameToDelete = g },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "ゲームを削除", tint = Color.Gray)
                                    }
                                }
                            }
                            IconButton(
                                onClick = { showAddGameDialog = true },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "ゲームを追加", tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Account Selector Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "アカウント:",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (selectedGameId != null) {
                                if (accounts.isNotEmpty()) {
                                    var expandedAccounts by remember { mutableStateOf(false) }
                                    val selectedAccount = remember(accounts, selectedAccountId) {
                                        accounts.find { it.id == selectedAccountId }
                                    }
                                    Button(
                                        onClick = { expandedAccounts = true },
                                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                    ) {
                                        Text(
                                            selectedAccount?.name ?: "選択してください",
                                            maxLines = 1
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = expandedAccounts,
                                        onDismissRequest = { expandedAccounts = false }
                                    ) {
                                        accounts.forEach { a ->
                                            DropdownMenuItem(
                                                text = { Text(a.name) },
                                                onClick = {
                                                    viewModel.selectAccount(a.id)
                                                    expandedAccounts = false
                                                }
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(4.dp))
                                    selectedAccount?.let { a ->
                                        IconButton(
                                            onClick = { accountToDelete = a },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(Icons.Default.Delete, contentDescription = "アカウントを削除", tint = Color.Gray)
                                        }
                                    }
                                }
                                IconButton(
                                    onClick = { showAddAccountDialog = true },
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "アカウントを追加", tint = MaterialTheme.colorScheme.primary)
                                }
                            } else {
                                Text("ゲームを先に追加してください", fontSize = 12.sp, color = Color.Gray)
                            }
                        }
                    }
                }
            }

            // Onboarding views when empty
            if (games.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("🐾 ようこそ！にゃんこチェックへ 🐾", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("まずは「＋」からゲームを登録してね！", fontSize = 14.sp)
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { showAddGameDialog = true }) {
                            Text("ゲームを追加する")
                        }
                    }
                }
            } else if (accounts.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("👤 アカウントが登録されていません", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("管理するアカウント名（例: メイン、サブ1）を追加してね！", fontSize = 13.sp, textAlign = TextAlign.Center)
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { showAddAccountDialog = true }) {
                            Text("アカウントを追加する")
                        }
                    }
                }
            } else {
                val filteredItems by remember(checkItems, currentCategoryType) {
                    derivedStateOf { checkItems.filter { it.type == currentCategoryType } }
                }
                val doneCount by remember(filteredItems) {
                    derivedStateOf { filteredItems.count { it.done } }
                }
                val totalCount by remember(filteredItems) {
                    derivedStateOf { filteredItems.size }
                }

                // 2. CATEGORY TABS
                ScrollableTabRow(
                    selectedTabIndex = selectedTabIdx,
                    edgePadding = 0.dp,
                    containerColor = Color.Transparent,
                    contentColor = MaterialTheme.colorScheme.primary
                ) {
                    categories.forEachIndexed { idx, pair ->
                        Tab(
                            selected = selectedTabIdx == idx,
                            onClick = { viewModel.selectTab(idx) },
                            text = { Text(pair.second, fontWeight = FontWeight.SemiBold) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Progress Indicator and Category Quick Reset
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("進捗: ", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "$doneCount / $totalCount",
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        LinearProgressIndicator(
                            progress = { if (totalCount > 0) doneCount.toFloat() / totalCount else 0f },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp)),
                            color = MaterialTheme.colorScheme.primary,
                            trackColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    }
                    Spacer(modifier = Modifier.width(16.dp))
                    IconButton(
                        onClick = {
                            if (doneCount > 0) {
                                showResetConfirmDialog = true
                            }
                        },
                        colors = IconButtonDefaults.iconButtonColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer
                        ),
                        enabled = doneCount > 0
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "このカテゴリを一括リセット",
                            tint = if (doneCount > 0) MaterialTheme.colorScheme.primary else Color.Gray
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // 3. CHECKLIST ITEMS LIST
                if (filteredItems.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("このカテゴリには項目がありません", color = Color.Gray, fontSize = 14.sp)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("右下の「＋」ボタンから追加してね🐾", color = Color.Gray, fontSize = 12.sp)
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        items(
                            items = filteredItems,
                            key = { it.id }
                        ) { item ->
                            CheckItemCard(
                                item = item,
                                onToggle = { viewModel.toggleCheckItem(item) },
                                onDelete = { viewModel.deleteCheckItem(item) }
                            )
                        }
                    }
                }
            }
        }

        // --- DIALOGS (WITH ACCIDENTAL LOSS PROTECTION) ---

        // 1. Add Game Dialog
        if (showAddGameDialog) {
            AlertDialog(
                onDismissRequest = { showAddGameDialog = false },
                title = { Text("🐾 ゲームを追加") },
                text = {
                    Column {
                        Text("管理したいゲーム名を入力してください", fontSize = 13.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        TextField(
                            value = gameNameInput,
                            onValueChange = { gameNameInput = it },
                            placeholder = { Text("例: にゃんこ大戦争、原神など") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("デイリー更新時刻 (時:分)", fontSize = 12.sp, color = Color.Gray)
                        Spacer(modifier = Modifier.height(4.dp))
                        TextField(
                            value = gameResetTimeInput,
                            onValueChange = { gameResetTimeInput = it },
                            placeholder = { Text("05:00") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (gameNameInput.isNotBlank()) {
                                viewModel.addGame(gameNameInput, gameResetTimeInput)
                                gameNameInput = ""
                                gameResetTimeInput = "05:00"
                                showAddGameDialog = false
                            }
                        }
                    ) { Text("追加") }
                },
                dismissButton = {
                    TextButton(onClick = { showAddGameDialog = false }) { Text("キャンセル") }
                }
            )
        }

        // 2. Add Account Dialog
        if (showAddAccountDialog) {
            AlertDialog(
                onDismissRequest = { showAddAccountDialog = false },
                title = { Text("👤 アカウントを追加") },
                text = {
                    Column {
                        Text("アカウント名を入力してください", fontSize = 13.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        TextField(
                            value = accountNameInput,
                            onValueChange = { accountNameInput = it },
                            placeholder = { Text("例: メイン垢、サブ垢1") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (accountNameInput.isNotBlank()) {
                                viewModel.addAccount(accountNameInput)
                                accountNameInput = ""
                                showAddAccountDialog = false
                            }
                        }
                    ) { Text("追加") }
                },
                dismissButton = {
                    TextButton(onClick = { showAddAccountDialog = false }) { Text("キャンセル") }
                }
            )
        }

        // 3. Add Check Item Dialog
        if (showAddItemDialog) {
            AlertDialog(
                onDismissRequest = { showAddItemDialog = false },
                title = { Text("✏️ 「$currentCategoryName」項目を追加") },
                text = {
                    Column {
                        Text("チェックするタスク名を入力してください", fontSize = 13.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        TextField(
                            value = checkItemLabelInput,
                            onValueChange = { checkItemLabelInput = it },
                            placeholder = { Text("例: デイリーミッション、ログインボーナス") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (checkItemLabelInput.isNotBlank()) {
                                viewModel.addCheckItem(checkItemLabelInput, currentCategoryType)
                                checkItemLabelInput = ""
                                showAddItemDialog = false
                            }
                        }
                    ) { Text("追加") }
                },
                dismissButton = {
                    TextButton(onClick = { showAddItemDialog = false }) { Text("キャンセル") }
                }
            )
        }

        // 4. Manual Reset Confirmation Dialog (Protects from accidental unchecking)
        if (showResetConfirmDialog) {
            AlertDialog(
                onDismissRequest = { showResetConfirmDialog = false },
                title = { Text("リセットの確認") },
                text = { Text("「$currentCategoryName」のチェックをすべて外しますか？") },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.resetCurrentCategoryItems(currentCategoryType)
                            showResetConfirmDialog = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("リセット")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showResetConfirmDialog = false }) { Text("キャンセル") }
                }
            )
        }

        // 5. Delete Game Confirmation Dialog
        gameToDelete?.let { g ->
            AlertDialog(
                onDismissRequest = { gameToDelete = null },
                title = { Text("ゲームの削除") },
                text = { Text("「${g.name}」を削除しますか？\n（関連するアカウントやチェック項目もすべて削除されます）") },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.deleteGame(g)
                            gameToDelete = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("削除する")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { gameToDelete = null }) { Text("キャンセル") }
                }
            )
        }

        // 6. Delete Account Confirmation Dialog
        accountToDelete?.let { a ->
            AlertDialog(
                onDismissRequest = { accountToDelete = null },
                title = { Text("アカウントの削除") },
                text = { Text("アカウント「${a.name}」を削除しますか？\n（登録されたチェック項目も削除されます）") },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.deleteAccount(a)
                            accountToDelete = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("削除する")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { accountToDelete = null }) { Text("キャンセル") }
                }
            )
        }
    }
}

@Composable
fun CheckItemCard(
    item: CheckItemEntity,
    onToggle: () -> Unit,
    onDelete: () -> Unit
) {
    val animatedBg by animateColorAsState(
        targetValue = if (item.done) Color(0xFFF1F8E9) else Color.White,
        animationSpec = tween(durationMillis = 200),
        label = "itemBgAnimation"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = animatedBg),
        elevation = CardDefaults.cardElevation(defaultElevation = if (item.done) 0.5.dp else 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Checkbox(
                checked = item.done,
                onCheckedChange = { onToggle() },
                colors = CheckboxDefaults.colors(
                    checkedColor = MaterialTheme.colorScheme.primary,
                    checkmarkColor = Color.White
                )
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = item.label,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                textDecoration = if (item.done) TextDecoration.LineThrough else TextDecoration.None,
                color = if (item.done) Color.Gray else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1.0f)
            )
            IconButton(
                onClick = { onDelete() },
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "この項目を削除",
                    tint = Color.LightGray
                )
            }
        }
    }
}
