package com.aistudio.nyankocheck.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class NyankoRepository(
    private val db: AppDatabase,
    private val preferences: NyankoPreferences
) {
    val allGames: Flow<List<GameEntity>> = db.gameDao().getAllGames()

    val prefs: NyankoPreferences get() = preferences

    suspend fun insertGame(game: GameEntity) = withContext(Dispatchers.IO) {
        db.gameDao().insertGame(game)
        // Initialize baseline reset timestamps for this game with current time so it starts clean
        val now = System.currentTimeMillis()
        if (preferences.getLastResetTimestamp(game.id, "daily") == 0L) {
            preferences.setLastResetTimestamp(game.id, "daily", now)
        }
        if (preferences.getLastResetTimestamp(game.id, "weekly") == 0L) {
            preferences.setLastResetTimestamp(game.id, "weekly", now)
        }
        if (preferences.getLastResetTimestamp(game.id, "monthly") == 0L) {
            preferences.setLastResetTimestamp(game.id, "monthly", now)
        }
    }

    suspend fun insertAccount(account: AccountEntity) = withContext(Dispatchers.IO) {
        db.accountDao().insertAccount(account)
    }

    suspend fun insertCheckItem(item: CheckItemEntity) = withContext(Dispatchers.IO) {
        db.checkItemDao().insertCheckItem(item)
    }

    fun getAccountsForGame(gameId: String): Flow<List<AccountEntity>> {
        return db.accountDao().getAccountsForGame(gameId)
    }

    fun getCheckItemsForAccount(accountId: String): Flow<List<CheckItemEntity>> {
        return db.checkItemDao().getCheckItemsForAccount(accountId)
    }

    suspend fun updateCheckItem(item: CheckItemEntity) = withContext(Dispatchers.IO) {
        db.checkItemDao().updateCheckItem(item)
    }

    suspend fun deleteGame(game: GameEntity) = withContext(Dispatchers.IO) {
        db.gameDao().deleteGame(game)
        preferences.removeGameResetTimestamps(game.id)
    }

    suspend fun deleteAccount(account: AccountEntity) = withContext(Dispatchers.IO) {
        db.accountDao().deleteAccount(account)
    }

    suspend fun deleteCheckItem(item: CheckItemEntity) = withContext(Dispatchers.IO) {
        db.checkItemDao().deleteCheckItem(item)
    }

    // High performance batch resets for explicit user requests
    suspend fun resetItemsForAccountAndType(accountId: String, type: String) = withContext(Dispatchers.IO) {
        db.checkItemDao().resetItemsForAccountAndType(accountId, type)
    }

    suspend fun resetAllItemsForAccount(accountId: String) = withContext(Dispatchers.IO) {
        db.checkItemDao().resetAllItemsForAccount(accountId)
    }

    /**
     * Automated date/time reset checker with safe boundaries.
     * Only resets if the scheduled reset time (e.g. 05:00) has legitimately passed.
     * Misc category is never reset automatically.
     */
    suspend fun checkAndExecuteAutoResets() = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()

        // First app run guard: if not initialized, set baseline to now and return safely
        if (!preferences.isInitialized) {
            preferences.isInitialized = true
        }

        val games = db.gameDao().getAllGamesSync()
        for (game in games) {
            // 1. Daily Reset Check
            val lastDaily = preferences.getLastResetTimestamp(game.id, "daily")
            if (lastDaily == 0L) {
                preferences.setLastResetTimestamp(game.id, "daily", now)
            } else if (ResetHelper.shouldResetDaily(lastDaily, now, game.dailyReset)) {
                db.checkItemDao().resetItemsForGameAndType(game.id, "daily")
                preferences.setLastResetTimestamp(game.id, "daily", now)
            }

            // 2. Weekly Reset Check
            val lastWeekly = preferences.getLastResetTimestamp(game.id, "weekly")
            if (lastWeekly == 0L) {
                preferences.setLastResetTimestamp(game.id, "weekly", now)
            } else if (ResetHelper.shouldResetWeekly(lastWeekly, now, game.weeklyDay, game.weeklyReset)) {
                db.checkItemDao().resetItemsForGameAndType(game.id, "weekly")
                preferences.setLastResetTimestamp(game.id, "weekly", now)
            }

            // 3. Monthly Reset Check
            val lastMonthly = preferences.getLastResetTimestamp(game.id, "monthly")
            if (lastMonthly == 0L) {
                preferences.setLastResetTimestamp(game.id, "monthly", now)
            } else if (ResetHelper.shouldResetMonthly(lastMonthly, now, game.monthlyDay, game.monthlyReset)) {
                db.checkItemDao().resetItemsForGameAndType(game.id, "monthly")
                preferences.setLastResetTimestamp(game.id, "monthly", now)
            }
        }
    }
}
