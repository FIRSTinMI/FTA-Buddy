package com.filipkin.ftahelper.ui.monitor;

import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

public class MonitorViewModel extends ViewModel {
    private MutableLiveData<FieldState> field;

    public MutableLiveData<FieldState> getField() {
        if (field == null) {
            field = new MutableLiveData<>();
        }

        return field;
    }
}