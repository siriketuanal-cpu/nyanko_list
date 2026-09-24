package com.aistudio.nyankocheck.data

import java.util.Calendar

object ResetHelper {

    /**
     * Determines whether daily reset should trigger.
     * Safe against:
     * - First launch or uninitialized timestamps (lastCheckMillis <= 0L -> returns false)
     * - Clock shifts backward (currentMillis < lastCheckMillis -> returns false)
     * - Exact reset boundary check
     */
    fun shouldResetDaily(lastCheckMillis: Long, currentMillis: Long, resetTimeStr: String = "05:00"): Boolean {
        if (lastCheckMillis <= 0L || currentMillis < lastCheckMillis) return false
        val resetHourMinute = parseHourMinute(resetTimeStr)

        val calLast = Calendar.getInstance().apply { timeInMillis = lastCheckMillis }
        val calNow = Calendar.getInstance().apply { timeInMillis = currentMillis }

        // Find the most recent daily reset point on or before currentMillis
        val calResetPoint = Calendar.getInstance().apply {
            timeInMillis = currentMillis
            set(Calendar.HOUR_OF_DAY, resetHourMinute.first)
            set(Calendar.MINUTE, resetHourMinute.second)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (calNow.before(calResetPoint)) {
            // e.g. Reset is at 05:00, but it's currently 04:00 today.
            // The most recent reset point was yesterday at 05:00.
            calResetPoint.add(Calendar.DAY_OF_YEAR, -1)
        }

        // If lastCheck was before the most recent reset point, we crossed the reset time!
        return calLast.before(calResetPoint)
    }

    /**
     * Determines whether weekly reset should trigger.
     * resetDayOfWeek: 1 = Sunday, 2 = Monday, ..., 7 = Saturday (java.util.Calendar constants)
     */
    fun shouldResetWeekly(lastCheckMillis: Long, currentMillis: Long, resetDayOfWeek: Int = Calendar.MONDAY, resetTimeStr: String = "05:00"): Boolean {
        if (lastCheckMillis <= 0L || currentMillis < lastCheckMillis) return false
        val resetHourMinute = parseHourMinute(resetTimeStr)

        val calLast = Calendar.getInstance().apply { timeInMillis = lastCheckMillis }
        val calNow = Calendar.getInstance().apply { timeInMillis = currentMillis }

        val calResetPoint = Calendar.getInstance().apply {
            timeInMillis = currentMillis
            set(Calendar.DAY_OF_WEEK, resetDayOfWeek)
            set(Calendar.HOUR_OF_DAY, resetHourMinute.first)
            set(Calendar.MINUTE, resetHourMinute.second)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (calNow.before(calResetPoint)) {
            calResetPoint.add(Calendar.WEEK_OF_YEAR, -1)
        }

        return calLast.before(calResetPoint)
    }

    /**
     * Determines whether monthly reset should trigger.
     */
    fun shouldResetMonthly(lastCheckMillis: Long, currentMillis: Long, resetDayOfMonth: Int = 1, resetTimeStr: String = "05:00"): Boolean {
        if (lastCheckMillis <= 0L || currentMillis < lastCheckMillis) return false
        val resetHourMinute = parseHourMinute(resetTimeStr)

        val calLast = Calendar.getInstance().apply { timeInMillis = lastCheckMillis }
        val calNow = Calendar.getInstance().apply { timeInMillis = currentMillis }

        val calResetPoint = Calendar.getInstance().apply {
            timeInMillis = currentMillis
            set(Calendar.DAY_OF_MONTH, resetDayOfMonth)
            set(Calendar.HOUR_OF_DAY, resetHourMinute.first)
            set(Calendar.MINUTE, resetHourMinute.second)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (calNow.before(calResetPoint)) {
            calResetPoint.add(Calendar.MONTH, -1)
        }

        return calLast.before(calResetPoint)
    }

    private fun parseHourMinute(timeStr: String): Pair<Int, Int> {
        return try {
            val parts = timeStr.split(":")
            val h = parts[0].trim().toInt().coerceIn(0, 23)
            val m = if (parts.size > 1) parts[1].trim().toInt().coerceIn(0, 59) else 0
            Pair(h, m)
        } catch (_: Exception) {
            Pair(5, 0)
        }
    }
}
