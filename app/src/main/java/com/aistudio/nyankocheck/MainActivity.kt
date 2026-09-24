package com.aistudio.nyankocheck

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import com.aistudio.nyankocheck.data.AppDatabase
import com.aistudio.nyankocheck.data.NyankoRepository
import com.aistudio.nyankocheck.ui.NyankoViewModel
import com.aistudio.nyankocheck.ui.NyankoViewModelFactory

class MainActivity : ComponentActivity() {
    private val viewModel: NyankoViewModel by viewModels {
        NyankoViewModelFactory(NyankoRepository(AppDatabase.getDatabase(this)))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val games by viewModel.games.collectAsState(initial = emptyList())
            var showDialog by androidx.compose.runtime.mutableStateOf(false)
            var gameName by androidx.compose.runtime.mutableStateOf("")

            androidx.compose.material3.Scaffold(
                floatingActionButton = {
                    androidx.compose.material3.FloatingActionButton(onClick = { showDialog = true }) {
                        androidx.compose.material3.Text("+")
                    }
                }
            ) { padding ->
                LazyColumn(contentPadding = padding) {
                    items(games) { game ->
                        androidx.compose.material3.Card(modifier = androidx.compose.ui.Modifier.padding(8.dp)) {
                            Text(text = game.name, modifier = androidx.compose.ui.Modifier.padding(16.dp))
                        }
                    }
                }
            }

            if (showDialog) {
                androidx.compose.material3.AlertDialog(
                    onDismissRequest = { showDialog = false },
                    title = { Text("Add Game") },
                    text = {
                        androidx.compose.material3.TextField(
                            value = gameName,
                            onValueChange = { gameName = it }
                        )
                    },
                    confirmButton = {
                        androidx.compose.material3.Button(onClick = {
                            viewModel.addGame(gameName)
                            showDialog = false
                            gameName = ""
                        }) { Text("Add") }
                    }
                )
            }
        }
    }
}
