package com.aistudio.nyankocheck.data

import kotlinx.coroutines.flow.Flow

class NyankoRepository(private val db: AppDatabase) {
    val allGames = db.gameDao().getAllGames()

    suspend fun insertGame(game: GameEntity) = db.gameDao().insertGame(game)
    suspend fun insertAccount(account: AccountEntity) = db.accountDao().insertAccount(account)
    suspend fun insertCheckItem(item: CheckItemEntity) = db.checkItemDao().insertCheckItem(item)

    fun getAccountsForGame(gameId: String) = db.accountDao().getAccountsForGame(gameId)
    fun getCheckItemsForAccount(accountId: String) = db.checkItemDao().getCheckItemsForAccount(accountId)

    suspend fun updateCheckItem(item: CheckItemEntity) = db.checkItemDao().updateCheckItem(item)
}
