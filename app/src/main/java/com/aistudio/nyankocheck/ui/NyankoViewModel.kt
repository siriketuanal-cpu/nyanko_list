package com.aistudio.nyankocheck.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aistudio.nyankocheck.data.AccountEntity
import com.aistudio.nyankocheck.data.CheckItemEntity
import com.aistudio.nyankocheck.data.GameEntity
import com.aistudio.nyankocheck.data.NyankoRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class NyankoViewModel(
    private val repository: NyankoRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    // 1. All games flow (Shared, lazy, stops when UI is stopped)
    val games: StateFlow<List<GameEntity>> = repository.allGames
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // 2. Selected Game ID - Restored immediately from Preferences or SavedStateHandle
    private val _selectedGameId = MutableStateFlow(
        savedStateHandle.get<String>("selected_game_id") ?: repository.prefs.lastSelectedGameId
    )
    val selectedGameId: StateFlow<String?> = _selectedGameId.asStateFlow()

    // 3. Selected Account ID - Restored immediately
    private val _selectedAccountId = MutableStateFlow(
        savedStateHandle.get<String>("selected_account_id") ?: repository.prefs.lastSelectedAccountId
    )
    val selectedAccountId: StateFlow<String?> = _selectedAccountId.asStateFlow()

    // 4. Selected Tab Index
    private val _selectedTabIndex = MutableStateFlow(
        savedStateHandle.get<Int>("selected_tab_idx") ?: repository.prefs.lastSelectedTabIndex
    )
    val selectedTabIndex: StateFlow<Int> = _selectedTabIndex.asStateFlow()

    // 5. Accounts for selected game (cached and reactive)
    val accounts: StateFlow<List<AccountEntity>> = _selectedGameId
        .flatMapLatest { gameId ->
            if (gameId != null) {
                repository.getAccountsForGame(gameId)
            } else {
                flowOf(emptyList())
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // 6. Check items for selected account
    val checkItems: StateFlow<List<CheckItemEntity>> = _selectedAccountId
        .flatMapLatest { accountId ->
            if (accountId != null) {
                repository.getCheckItemsForAccount(accountId)
            } else {
                flowOf(emptyList())
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        // Perform fast automated reset check on startup
        checkAutoResets()
    }

    fun onResume() {
        // Called when activity comes to foreground (task resume / unlock / freeze recovery)
        checkAutoResets()
    }

    private fun checkAutoResets() {
        viewModelScope.launch {
            repository.checkAndExecuteAutoResets()
        }
    }

    fun selectGame(gameId: String?) {
        _selectedGameId.value = gameId
        savedStateHandle["selected_game_id"] = gameId
        repository.prefs.lastSelectedGameId = gameId

        // Reset selected account if game changes
        _selectedAccountId.value = null
        savedStateHandle["selected_account_id"] = null
        repository.prefs.lastSelectedAccountId = null
    }

    fun selectAccount(accountId: String?) {
        _selectedAccountId.value = accountId
        savedStateHandle["selected_account_id"] = accountId
        repository.prefs.lastSelectedAccountId = accountId
    }

    fun selectTab(index: Int) {
        _selectedTabIndex.value = index
        savedStateHandle["selected_tab_idx"] = index
        repository.prefs.lastSelectedTabIndex = index
    }

    // --- GAME CRUD ---
    fun addGame(name: String, dailyReset: String = "05:00") {
        val trimmedName = name.trim()
        if (trimmedName.isEmpty()) return
        val trimmedReset = dailyReset.trim().ifEmpty { "05:00" }
        val newGame = GameEntity(
            id = System.currentTimeMillis().toString(),
            name = trimmedName,
            dailyReset = trimmedReset
        )
        viewModelScope.launch {
            repository.insertGame(newGame)
            if (_selectedGameId.value == null) {
                selectGame(newGame.id)
            }
        }
    }

    fun deleteGame(game: GameEntity) {
        viewModelScope.launch {
            repository.deleteGame(game)
            if (_selectedGameId.value == game.id) {
                selectGame(null)
            }
        }
    }

    // --- ACCOUNT CRUD ---
    fun addAccount(name: String, note: String = "") {
        val gameId = _selectedGameId.value ?: return
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        val newAccount = AccountEntity(
            id = System.currentTimeMillis().toString(),
            gameId = gameId,
            name = trimmed,
            note = note.trim()
        )
        viewModelScope.launch {
            repository.insertAccount(newAccount)
            if (_selectedAccountId.value == null) {
                selectAccount(newAccount.id)
            }
        }
    }

    fun deleteAccount(account: AccountEntity) {
        viewModelScope.launch {
            repository.deleteAccount(account)
            if (_selectedAccountId.value == account.id) {
                selectAccount(null)
            }
        }
    }

    // --- CHECK ITEM CRUD ---
    fun addCheckItem(label: String, type: String) {
        val accountId = _selectedAccountId.value ?: return
        val trimmed = label.trim()
        if (trimmed.isEmpty()) return
        val newItem = CheckItemEntity(
            accountId = accountId,
            type = type,
            label = trimmed,
            done = false
        )
        viewModelScope.launch {
            repository.insertCheckItem(newItem)
        }
    }

    fun toggleCheckItem(item: CheckItemEntity) {
        viewModelScope.launch {
            repository.updateCheckItem(item.copy(done = !item.done))
        }
    }

    fun deleteCheckItem(item: CheckItemEntity) {
        viewModelScope.launch {
            repository.deleteCheckItem(item)
        }
    }

    // --- BATCH RESET FUNCTIONALITY ---
    fun resetCurrentCategoryItems(type: String) {
        val accountId = _selectedAccountId.value ?: return
        viewModelScope.launch {
            repository.resetItemsForAccountAndType(accountId, type)
        }
    }

    fun resetAllItemsForCurrentAccount() {
        val accountId = _selectedAccountId.value ?: return
        viewModelScope.launch {
            repository.resetAllItemsForAccount(accountId)
        }
    }
}

class NyankoViewModelFactory(
    private val repository: NyankoRepository,
    private val defaultSavedStateHandle: SavedStateHandle
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(NyankoViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return NyankoViewModel(repository, defaultSavedStateHandle) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
