package com.aistudio.nyankocheck.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [GameEntity::class, AccountEntity::class, CheckItemEntity::class],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun gameDao(): GameDao
    abstract fun accountDao(): AccountDao
    abstract fun checkItemDao(): CheckItemDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "nyankocheck_database"
                )
                    .fallbackToDestructiveMigration()
                    .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING) // High performance WAL mode
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
