package com.filipkin.ftahelper.ui.notes;

import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import org.json.JSONObject;

import java.util.ArrayList;

public class NotesViewModel extends ViewModel {
    private MutableLiveData<ArrayList<String>> teams;
    private MutableLiveData<ArrayList<JSONObject>> messages;
    public MutableLiveData<ArrayList<String>> getTeams() {
        if (teams == null) {
            teams = new MutableLiveData<>();
        }

        return teams;
    }

    public MutableLiveData<ArrayList<JSONObject>> getMessages() {
        if (messages == null) {
            messages = new MutableLiveData<>();
        }

        return messages;
    }
}