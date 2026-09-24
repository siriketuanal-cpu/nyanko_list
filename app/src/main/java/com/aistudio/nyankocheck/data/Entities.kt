package com.aistudio.nyankocheck.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ForeignKey

@Entity(tableName = "games")
data class GameEntity(
    @PrimaryKey val id: String,
    val name: String,
    val dailyReset: String = "05:00",
    val weeklyDay: Int = 1,
    val weeklyReset: String = "05:00",
    val monthlyDay: Int = 1,
    val monthlyReset: String = "05:00"
)

@Entity(tableName = "accounts", foreignKeys = [ForeignKey(entity = GameEntity::class, parentColumns = ["id"], childColumns = ["gameId"], onDelete = ForeignKey.CASCADE)])
data class AccountEntity(
    @PrimaryKey val id: String,
    val gameId: String,
    val name: String,
    val note: String = ""
)

@Entity(tableName = "check_items", foreignKeys = [ForeignKey(entity = AccountEntity::class, parentColumns = ["id"], childColumns = ["accountId"], onDelete = ForeignKey.CASCADE)])
data class CheckItemEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val accountId: String,
    val type: String, // "daily", "weekly", "monthly", "misc"
    val label: String,
    val done: Boolean = false,
    val position: Int = 0
)
