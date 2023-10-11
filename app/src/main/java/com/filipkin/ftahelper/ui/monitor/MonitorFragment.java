package com.filipkin.ftahelper.ui.monitor;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.ViewModelProvider;

import com.filipkin.ftahelper.databinding.FragmentMonitorBinding;

public class MonitorFragment extends Fragment {

    private FragmentMonitorBinding binding;

    public View onCreateView(@NonNull LayoutInflater inflater,
                             ViewGroup container, Bundle savedInstanceState) {
        MonitorViewModel monitorViewModel =
                new ViewModelProvider(this).get(MonitorViewModel.class);

        binding = FragmentMonitorBinding.inflate(inflater, container, false);
        View root = binding.getRoot();

        return root;
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}