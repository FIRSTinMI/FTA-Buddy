package com.filipkin.ftahelper.ui.notes;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.database.DataSetObserver;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.DialogFragment;
import androidx.lifecycle.Observer;
import androidx.lifecycle.ViewModelProvider;

import android.text.InputType;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Toast;

import com.filipkin.ftahelper.R;
import com.filipkin.ftahelper.databinding.FragmentNotesBinding;
import com.filipkin.ftahelper.util.Fetch;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Objects;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;


public class NotesFragment extends DialogFragment {

    private FragmentNotesBinding binding;
    private NotesViewModel notesViewModel;
    private int profileNumber;
    private String profileName;
    private SharedPreferences sharedPreferences;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        notesViewModel = new ViewModelProvider(this).get(NotesViewModel.class);

        binding = FragmentNotesBinding.inflate(inflater, container, false);
        View root = binding.getRoot();

        sharedPreferences = requireContext().getSharedPreferences("FTABuddy", 0);
        String eventCode = sharedPreferences.getString("eventCode", null);
        if (eventCode == null) {
            return root;
        }
        String currentlySelectedTeam = sharedPreferences.getString("selectedTeam", null);

        profileName = sharedPreferences.getString("profileName", null);
        profileNumber = sharedPreferences.getInt("profileNumber", -1);

        if (profileNumber < 0) {
            AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());

            final EditText usernameInput = new EditText(root.getContext());
            usernameInput.setImeOptions(EditorInfo.IME_ACTION_DONE);
            usernameInput.setOnEditorActionListener((v, actionId, event) -> {
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    registerUsername(usernameInput);
                }
                return false;
            });

            usernameInput.setInputType(InputType.TYPE_CLASS_TEXT);

            builder.setMessage(R.string.notes_login_dialog)
                    .setView(usernameInput)
                    .setPositiveButton("OK", (dialog, which) -> {
                        registerUsername(usernameInput);
                    });
                    builder.setNegativeButton("Cancel", (dialog, which) -> {
                        binding.notesMessage.setEnabled(false);
                        binding.sendButton.setEnabled(false);
                        dialog.cancel();
                    });

            AlertDialog dialog = builder.create();
            dialog.show();
        }

        binding.teamSelector.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String team = binding.teamSelector.getSelectedItem().toString();
                sharedPreferences.edit().putString("selectedTeam", team).apply();
                loadNotes(team);
            }
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        @SuppressLint("SetTextI18n")
        final Observer<ArrayList<String>> teamsObserver = newTeams -> {
            Spinner spinner = binding.teamSelector;
            spinner.setAdapter(new ArrayAdapter<>(root.getContext(),  android.R.layout.simple_spinner_dropdown_item, newTeams));
            if (newTeams.contains(currentlySelectedTeam)) {
                spinner.setSelection(newTeams.indexOf(currentlySelectedTeam));
            }
        };

        notesViewModel.getTeams().observe(getViewLifecycleOwner(), teamsObserver);

        try {
            Fetch.get("https://ftahelper.filipkin.com/teams/" + URLEncoder.encode(eventCode, "UTF-8"), new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error connecting to cloud server", Toast.LENGTH_LONG).show());
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    try {
                        JSONArray jsonArray = new JSONArray(response.body().string());

                        String[] teamsArray = new String[jsonArray.length()];
                        for(int i = 0; i < jsonArray.length(); i++) {
                            teamsArray[i] = Integer.toString(jsonArray.getInt(i));
                        }
                        Arrays.sort(teamsArray);

                        requireActivity().runOnUiThread(() -> notesViewModel.getTeams().setValue(new ArrayList<>(Arrays.asList(teamsArray))));
                    } catch (JSONException e) {
                        requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error getting teams list from cloud", Toast.LENGTH_LONG).show());
                    }
                }
            });
        } catch (UnsupportedEncodingException e) {
            Log.e("Notes", Objects.requireNonNull(e.getMessage()));
        }

        return root;
    }

    private void registerUsername(EditText usernameInput) {
        try {
            JSONObject body = (new JSONObject()).put("username", usernameInput.getText().toString());
            Fetch.post("https://ftabuddy.filipkin.com/profile", body.toString(), new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error communicating with server", Toast.LENGTH_LONG).show());
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    if (response.code() == 400) {
                        requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Username already in use", Toast.LENGTH_SHORT).show());
                        return;
                    }
                    profileName = usernameInput.getText().toString();
                    profileNumber = Integer.parseInt(response.body().string());
                    sharedPreferences
                            .edit()
                            .putString("profileName", profileName)
                            .putInt("profileNumber", profileNumber)
                            .apply();
                    requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Welcome "+profileName+" :)", Toast.LENGTH_SHORT).show());
                }
            });
        } catch(JSONException e) {
            requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error parsing JSON", Toast.LENGTH_LONG).show());
        }
    }

    void loadNotes(String team) {
        Fetch.get("https://ftabuddy.filipkin.com/message/" + team, new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {

            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                System.out.println(response.body().string());
            }
        });
    }
}