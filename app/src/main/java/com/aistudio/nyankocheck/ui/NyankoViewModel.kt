package com.aistudio.nyankocheck.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aistudio.nyankocheck.data.NyankoRepository
import kotlinx.coroutines.launch

class NyankoViewModel(private val repository: NyankoRepository) : ViewModel() {
    val games = repository.allGames

    fun addGame(name: String) {
        val game = com.aistudio.nyankocheck.data.GameEntity(id = System.currentTimeMillis().toString(), name = name)
        androidx.lifecycle.viewModelScope.launch {
            repository.insertGame(game)
        }
    }
}

class NyankoViewModelFactory(private val repository: NyankoRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(NyankoViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return NyankoViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
