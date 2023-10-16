package com.filipkin.ftahelper.ui.notes;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.DialogFragment;
import androidx.lifecycle.Observer;
import androidx.lifecycle.ViewModelProvider;

import android.text.Html;
import android.text.InputType;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
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
import java.util.Comparator;
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
    private String currentlySelectedTeam;
    private String eventCode;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        // Load view model and inflate view
        notesViewModel = new ViewModelProvider(this).get(NotesViewModel.class);
        binding = FragmentNotesBinding.inflate(inflater, container, false);
        View root = binding.getRoot();

        // Load shared preferences (event code, currently selected team, profile info)
        sharedPreferences = requireContext().getSharedPreferences("FTABuddy", 0);
        eventCode = sharedPreferences.getString("eventCode", null);
        if (eventCode == null) {
            return root;
        }
        currentlySelectedTeam = sharedPreferences.getString("selectedTeam", null);

        profileName = sharedPreferences.getString("profileName", null);
        profileNumber = sharedPreferences.getInt("profileNumber", -1);

        // If there's no profile saved then ask user to create new profile
        if (profileNumber < 0) {
            AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());

            // Dialog text input
            final EditText usernameInput = new EditText(root.getContext());
            usernameInput.setInputType(InputType.TYPE_CLASS_TEXT);
            usernameInput.setImeOptions(EditorInfo.IME_ACTION_DONE);
            usernameInput.setOnEditorActionListener((v, actionId, event) -> {
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    registerUsername(usernameInput);
                }
                return false;
            });

            // Build dialog
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

        // Handle the team selector being changed
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

        // Update team list in selector from live data
        @SuppressLint("SetTextI18n")
        final Observer<ArrayList<String>> teamsObserver = newTeams -> {
            Spinner spinner = binding.teamSelector;
            spinner.setAdapter(new ArrayAdapter<>(root.getContext(),  android.R.layout.simple_spinner_dropdown_item, newTeams));
            if (newTeams.contains(currentlySelectedTeam)) {
                spinner.setSelection(newTeams.indexOf(currentlySelectedTeam));
            }
        };

        notesViewModel.getTeams().observe(getViewLifecycleOwner(), teamsObserver);

        // Update notes from live view
        @SuppressLint("SetTextI18n")
        final Observer<ArrayList<JSONObject>> messagesObserver = newMessages -> {
            binding.messageContainer.removeAllViews();
            for (JSONObject msg : newMessages) {
                TextView textView = new TextView(requireContext());
                String messageString = null;
                try {
                    messageString = String.format("<b>%s</b> @%s<br/><span style=\"font-size: 12px\">%s</span><br/>%s",
                            msg.getString("username"),
                            msg.getString("event"),
                            msg.getString("created"),
                            msg.getString("message"));
                } catch (JSONException e) {
                    throw new RuntimeException(e);
                }
                textView.setText(Html.fromHtml(messageString, Html.FROM_HTML_MODE_COMPACT));
                binding.messageContainer.addView(textView);
            }
            ScrollView scrollView = binding.messageContainerScroll;
            scrollView.postDelayed((Runnable) () -> scrollView.smoothScrollTo(0, binding.messageContainerScroll.getHeight() + 72),250);
        };

        notesViewModel.getMessages().observe(getViewLifecycleOwner(), messagesObserver);

        // Fetch team list
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

        // Handle message sending
        binding.sendButton.setOnClickListener(v -> handleSend());
        binding.notesMessage.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                handleSend();
            }
            return false;
        });

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

    private void loadNotes(String team) {
        Fetch.get("https://ftabuddy.filipkin.com/message/" + team, new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {

            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) {
                try {
                    JSONArray jsonMessages = new JSONArray(response.body().string());
                    ArrayList<JSONObject> messages = new ArrayList<>();
                    for (int i = 0; i < jsonMessages.length(); i++) {
                        messages.add(jsonMessages.getJSONObject(i));
                    }
                    messages.sort((Comparator<JSONObject>) (o1, o2) -> {
                        try {
                            return o1.getString("created").compareTo(o2.getString("created"));
                        } catch (JSONException e) {
                            throw new RuntimeException(e);
                        }
                    });

                    requireActivity().runOnUiThread(() -> notesViewModel.getMessages().setValue(messages));

                } catch (JSONException e) {
                    throw new RuntimeException(e);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }

            }
        });
    }

    private void handleSend() {
        String msg = binding.notesMessage.getText().toString().trim();
        if (msg.length() > 0 && profileNumber > 0 && currentlySelectedTeam != null && eventCode != null) {
            binding.sendButton.setEnabled(false);
            binding.notesMessage.setEnabled(false);
            sendMessage(currentlySelectedTeam, msg);
        }
    }

    private void sendMessage(String team, String msg) {
        JSONObject body = new JSONObject();
        try {
            body.put("profile", profileNumber);
            body.put("event", sharedPreferences.getString("eventCode", null));
            body.put("message", msg);
        } catch (JSONException e) {
            requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error encoding JSON body", Toast.LENGTH_LONG).show());
        }
        Fetch.post("https://ftabuddy.filipkin.com/message/" + team, body.toString(), new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error posting message to cloud", Toast.LENGTH_LONG).show());
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                requireActivity().runOnUiThread(() -> {
                    binding.notesMessage.setText("");
                    binding.sendButton.setEnabled(true);
                    binding.notesMessage.setEnabled(true);
                });
                // TODO: Append message to UI
            }
        });
    }
}