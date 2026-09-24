package com.aistudio.nyankocheck.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface GameDao {
    @Query("SELECT * FROM games ORDER BY name ASC")
    fun getAllGames(): Flow<List<GameEntity>>

    @Query("SELECT * FROM games")
    suspend fun getAllGamesSync(): List<GameEntity>

    @Query("SELECT * FROM games WHERE id = :id LIMIT 1")
    suspend fun getGameById(id: String): GameEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGame(game: GameEntity)

    @Delete
    suspend fun deleteGame(game: GameEntity)
}

@Dao
interface AccountDao {
    @Query("SELECT * FROM accounts WHERE gameId = :gameId ORDER BY name ASC")
    fun getAccountsForGame(gameId: String): Flow<List<AccountEntity>>

    @Query("SELECT * FROM accounts WHERE gameId = :gameId")
    suspend fun getAccountsForGameSync(gameId: String): List<AccountEntity>

    @Query("SELECT * FROM accounts WHERE id = :id LIMIT 1")
    suspend fun getAccountById(id: String): AccountEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccount(account: AccountEntity)

    @Delete
    suspend fun deleteAccount(account: AccountEntity)
}

@Dao
interface CheckItemDao {
    @Query("SELECT * FROM check_items WHERE accountId = :accountId ORDER BY position ASC, id ASC")
    fun getCheckItemsForAccount(accountId: String): Flow<List<CheckItemEntity>>

    @Query("SELECT * FROM check_items WHERE accountId = :accountId AND type = :type ORDER BY position ASC, id ASC")
    fun getCheckItemsForAccountAndType(accountId: String, type: String): Flow<List<CheckItemEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCheckItem(checkItem: CheckItemEntity)

    @Update
    suspend fun updateCheckItem(checkItem: CheckItemEntity)

    @Delete
    suspend fun deleteCheckItem(checkItem: CheckItemEntity)

    @Query("UPDATE check_items SET done = 0 WHERE accountId = :accountId AND type = :type")
    suspend fun resetItemsForAccountAndType(accountId: String, type: String)

    @Query("UPDATE check_items SET done = 0 WHERE accountId = :accountId")
    suspend fun resetAllItemsForAccount(accountId: String)

    @Query("UPDATE check_items SET done = 0 WHERE type = :type AND accountId IN (SELECT id FROM accounts WHERE gameId = :gameId)")
    suspend fun resetItemsForGameAndType(gameId: String, type: String)
}
