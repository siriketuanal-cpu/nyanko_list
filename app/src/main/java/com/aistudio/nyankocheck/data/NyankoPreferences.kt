package com.aistudio.nyankocheck.data

import android.content.Context
import android.content.SharedPreferences

class NyankoPreferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "nyanko_check_prefs"
        private const val KEY_LAST_GAME_ID = "last_selected_game_id"
        private const val KEY_LAST_ACCOUNT_ID = "last_selected_account_id"
        private const val KEY_LAST_TAB_INDEX = "last_selected_tab_index"
        private const val KEY_APP_INITIALIZED = "app_initialized"
    }

    var isInitialized: Boolean
        get() = prefs.getBoolean(KEY_APP_INITIALIZED, false)
        set(value) = prefs.edit().putBoolean(KEY_APP_INITIALIZED, value).apply()

    var lastSelectedGameId: String?
        get() = prefs.getString(KEY_LAST_GAME_ID, null)
        set(value) = prefs.edit().putString(KEY_LAST_GAME_ID, value).apply()

    var lastSelectedAccountId: String?
        get() = prefs.getString(KEY_LAST_ACCOUNT_ID, null)
        set(value) = prefs.edit().putString(KEY_LAST_ACCOUNT_ID, value).apply()

    var lastSelectedTabIndex: Int
        get() = prefs.getInt(KEY_LAST_TAB_INDEX, 0)
        set(value) = prefs.edit().putInt(KEY_LAST_TAB_INDEX, value).apply()

    fun getLastResetTimestamp(gameId: String, type: String): Long {
        val key = "last_reset_${gameId}_$type"
        return prefs.getLong(key, 0L)
    }

    fun setLastResetTimestamp(gameId: String, type: String, timestamp: Long) {
        val key = "last_reset_${gameId}_$type"
        prefs.edit().putLong(key, timestamp).apply()
    }

    fun removeGameResetTimestamps(gameId: String) {
        prefs.edit()
            .remove("last_reset_${gameId}_daily")
            .remove("last_reset_${gameId}_weekly")
            .remove("last_reset_${gameId}_monthly")
            .apply()
    }
}
