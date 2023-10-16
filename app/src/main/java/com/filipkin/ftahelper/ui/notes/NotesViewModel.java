package com.filipkin.ftahelper.ui.notes;

import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import java.util.ArrayList;

public class NotesViewModel extends ViewModel {
    private MutableLiveData<ArrayList<String>> teams;

    public MutableLiveData<ArrayList<String>> getTeams() {
        if (teams == null) {
            teams = new MutableLiveData<>();
        }

        return teams;
    }
}