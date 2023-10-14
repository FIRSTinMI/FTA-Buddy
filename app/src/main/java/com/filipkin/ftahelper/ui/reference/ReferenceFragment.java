package com.filipkin.ftahelper.ui.reference;

import androidx.lifecycle.ViewModelProvider;

import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.filipkin.ftahelper.R;

public class ReferenceFragment extends Fragment {

    private ReferenceViewModel mViewModel;

    public static ReferenceFragment newInstance() {
        return new ReferenceFragment();
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_reference, container, false);
    }
}