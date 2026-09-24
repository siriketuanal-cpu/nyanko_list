package com.aistudio.nyankocheck.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface GameDao {
    @Query("SELECT * FROM games")
    fun getAllGames(): Flow<List<GameEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGame(game: GameEntity)

    @Delete
    suspend fun deleteGame(game: GameEntity)
}

@Dao
interface AccountDao {
    @Query("SELECT * FROM accounts WHERE gameId = :gameId")
    fun getAccountsForGame(gameId: String): Flow<List<AccountEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccount(account: AccountEntity)

    @Delete
    suspend fun deleteAccount(account: AccountEntity)
}

@Dao
interface CheckItemDao {
    @Query("SELECT * FROM check_items WHERE accountId = :accountId")
    fun getCheckItemsForAccount(accountId: String): Flow<List<CheckItemEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCheckItem(checkItem: CheckItemEntity)

    @Update
    suspend fun updateCheckItem(checkItem: CheckItemEntity)

    @Delete
    suspend fun deleteCheckItem(checkItem: CheckItemEntity)
}
