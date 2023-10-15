package com.filipkin.ftahelper.ui.notes;

import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

public class NotesViewModel extends ViewModel {
    private MutableLiveData<String[]> teams;

    public MutableLiveData<String[]> getTeams() {
        if (teams == null) {
            teams = new MutableLiveData<>();
        }

        return teams;
    }
}