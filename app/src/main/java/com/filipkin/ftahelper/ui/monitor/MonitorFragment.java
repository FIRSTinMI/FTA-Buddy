package com.filipkin.ftahelper.ui.monitor;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.res.Resources;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.Observer;
import androidx.lifecycle.ViewModelProvider;

import com.filipkin.ftahelper.R;
import com.filipkin.ftahelper.util.Fetch;
import com.filipkin.ftahelper.util.WebSocket;
import com.filipkin.ftahelper.databinding.FragmentMonitorBinding;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.util.Timer;
import java.util.TimerTask;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class MonitorFragment extends Fragment {

    private FragmentMonitorBinding binding;
    private URI uri;
    private final FieldState field = new FieldState() {};
    private MonitorViewModel monitorViewModel;
    private boolean firstConnection = true;
    private WebSocket ws;

    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        monitorViewModel = new ViewModelProvider(this).get(MonitorViewModel.class);

        binding = FragmentMonitorBinding.inflate(inflater, container, false);
        View root = binding.getRoot();

        SharedPreferences sharedPreferences = requireContext().getSharedPreferences("FTABuddy", 0);

        boolean relayEnabled = sharedPreferences.getBoolean("relayEnabled", false);
        binding.relaySwitch.setChecked(relayEnabled);

        String savedEvent = sharedPreferences.getString("eventCode", null);
        if (savedEvent != null) {
            binding.monitorEvent.setText(savedEvent);
            parseEventCodeAndConnect(savedEvent);
        }

        // Change in event code or ip field
        binding.monitorEvent.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                String eventInput = binding.monitorEvent.getText().toString();

                sharedPreferences.edit().putString("eventCode", eventInput).apply();

                firstConnection = true;
                parseEventCodeAndConnect(eventInput);

                binding.monitorEvent.clearFocus();
            }
            return false;
        });

        // If the relay switch is changed then restart the connection procedure
        binding.relaySwitch.setOnCheckedChangeListener((buttonView, isChecked) -> {
            sharedPreferences.edit().putBoolean("relayEnabled", isChecked).apply();

            String eventInput = binding.monitorEvent.getText().toString();
            if (!eventInput.isEmpty()) {
                parseEventCodeAndConnect(eventInput);
            }
        });

        Resources res = getResources();

        String[] fieldStates = res.getStringArray(R.array.field_state);
        String[] dsStates = res.getStringArray(R.array.ds_state);
        int[] colors = {
                ContextCompat.getColor(root.getContext(), R.color.red_bad),
                ContextCompat.getColor(root.getContext(), R.color.green),
                ContextCompat.getColor(root.getContext(), R.color.green),
                ContextCompat.getColor(root.getContext(), R.color.yellow),
                ContextCompat.getColor(root.getContext(), R.color.yellow),
                ContextCompat.getColor(root.getContext(), R.color.red_bypass)
        };

        // TODO: Navigate to notes by clicking team number
        /*
        binding.blue1Number.setOnClickListener(v -> {
            System.out.println("Navigate away");
            sharedPreferences.edit().putString("selectedTeam", ((TextView) v).getText().toString()).apply();
            NavOptions.Builder navBuilder = new NavOptions.Builder();
            NavOptions navOptions = navBuilder.setPopUpTo(R.id.navigation_notes, false).build();
            NavController navController = NavHostFragment.findNavController(MonitorFragment.this);
            navController.navigate(R.id.navigation_notes, null, navOptions);
        });
         */

        @SuppressLint("SetTextI18n")
        final Observer<FieldState> fieldObserver = newField -> {
            binding.matchNumber.setText(getString(R.string.match_display, newField.match));
            binding.fieldState.setText(fieldStates[newField.field]);
            binding.fieldState.setBackgroundColor((newField.field == 1 || newField.field == 3 || newField.field == 4) ? colors[1] : colors[0]);
            binding.timeBehind.setText(newField.time);

            // Yes, I know... this is horrible.
            binding.blue1Number.setText(Integer.toString(newField.blue1.number));
            binding.blue1Ds.setBackgroundColor(colors[newField.blue1.ds]);
            binding.blue1Ds.setText(dsStates[newField.blue1.ds]);
            binding.blue1Radio.setBackgroundColor(colors[newField.blue1.radio]);
            if (newField.blue1.rio == 0) {
                binding.blue1Rio.setBackgroundColor(colors[0]);
            } else if (newField.blue1.code == 0) {
                binding.blue1Rio.setBackgroundColor(colors[3]);
            } else {
                binding.blue1Rio.setBackgroundColor(colors[1]);
            }
            binding.blue1Battery.setText(getString(R.string.battery, newField.blue1.battery));
            binding.blue1Ping.setText(getString(R.string.ping, newField.blue1.ping));
            binding.blue1Bwu.setText(getString(R.string.bwu, newField.blue1.bwu));

            binding.blue2Number.setText(Integer.toString(newField.blue2.number));
            binding.blue2Ds.setBackgroundColor(colors[newField.blue2.ds]);
            binding.blue2Ds.setText(dsStates[newField.blue2.ds]);
            binding.blue2Radio.setBackgroundColor(colors[newField.blue2.radio]);
            if (newField.blue2.rio == 0) {
                binding.blue2Rio.setBackgroundColor(colors[0]);
            } else if (newField.blue2.code == 0) {
                binding.blue2Rio.setBackgroundColor(colors[3]);
            } else {
                binding.blue2Rio.setBackgroundColor(colors[1]);
            }
            binding.blue2Battery.setText(getString(R.string.battery, newField.blue2.battery));
            binding.blue2Ping.setText(getString(R.string.ping, newField.blue2.ping));
            binding.blue2Bwu.setText(getString(R.string.bwu, newField.blue2.bwu));

            binding.blue3Number.setText(Integer.toString(newField.blue3.number));
            binding.blue3Ds.setBackgroundColor(colors[newField.blue3.ds]);
            binding.blue3Ds.setText(dsStates[newField.blue3.ds]);
            binding.blue3Radio.setBackgroundColor(colors[newField.blue3.radio]);
            if (newField.blue3.rio == 0) {
                binding.blue3Rio.setBackgroundColor(colors[0]);
            } else if (newField.blue3.code == 0) {
                binding.blue3Rio.setBackgroundColor(colors[3]);
            } else {
                binding.blue3Rio.setBackgroundColor(colors[1]);
            }
            binding.blue3Battery.setText(getString(R.string.battery, newField.blue3.battery));
            binding.blue3Ping.setText(getString(R.string.ping, newField.blue3.ping));
            binding.blue3Bwu.setText(getString(R.string.bwu, newField.blue3.bwu));

            binding.red1Number.setText(Integer.toString(newField.red1.number));
            binding.red1Ds.setBackgroundColor(colors[newField.red1.ds]);
            binding.red1Ds.setText(dsStates[newField.red1.ds]);
            binding.red1Radio.setBackgroundColor(colors[newField.red1.radio]);
            if (newField.red1.rio == 0) {
                binding.red1Rio.setBackgroundColor(colors[0]);
            } else if (newField.red1.code == 0) {
                binding.red1Rio.setBackgroundColor(colors[3]);
            } else {
                binding.red1Rio.setBackgroundColor(colors[1]);
            }
            binding.red1Battery.setText(getString(R.string.battery, newField.red1.battery));
            binding.red1Ping.setText(getString(R.string.ping, newField.red1.ping));
            binding.red1Bwu.setText(getString(R.string.bwu, newField.red1.bwu));

            binding.red2Number.setText(Integer.toString(newField.red2.number));
            binding.red2Ds.setBackgroundColor(colors[newField.red2.ds]);
            binding.red2Ds.setText(dsStates[newField.red2.ds]);
            binding.red2Radio.setBackgroundColor(colors[newField.red2.radio]);
            if (newField.red2.rio == 0) {
                binding.red2Rio.setBackgroundColor(colors[0]);
            } else if (newField.red2.code == 0) {
                binding.red2Rio.setBackgroundColor(colors[3]);
            } else {
                binding.red2Rio.setBackgroundColor(colors[1]);
            }
            binding.red2Battery.setText(getString(R.string.battery, newField.red2.battery));
            binding.red2Ping.setText(getString(R.string.ping, newField.red2.ping));
            binding.red2Bwu.setText(getString(R.string.bwu, newField.red2.bwu));

            binding.red3Number.setText(Integer.toString(newField.red3.number));
            binding.red3Ds.setBackgroundColor(colors[newField.red3.ds]);
            binding.red3Ds.setText(dsStates[newField.red3.ds]);
            binding.red3Radio.setBackgroundColor(colors[newField.red3.radio]);
            if (newField.red3.rio == 0) {
                binding.red3Rio.setBackgroundColor(colors[0]);
            } else if (newField.red3.code == 0) {
                binding.red3Rio.setBackgroundColor(colors[3]);
            } else {
                binding.red3Rio.setBackgroundColor(colors[1]);
            }
            binding.red3Battery.setText(getString(R.string.battery, newField.red3.battery));
            binding.red3Ping.setText(getString(R.string.ping, newField.red3.ping));
            binding.red3Bwu.setText(getString(R.string.bwu, newField.red3.bwu));
        };

        monitorViewModel.getField().observe(getViewLifecycleOwner(), fieldObserver);
        monitorViewModel.getField().setValue(field);

        return root;
    }

    private void parseEventCodeAndConnect(String eventInput) {
        if (eventInput.matches("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$")) {
            binding.relaySwitch.setChecked(false);
            binding.relaySwitch.setEnabled(false);
            uri = URI.create("ws://" + eventInput + ":8284/");
            System.out.println(uri.toString());
            openWebSocket();
        } else {
            try {
                binding.relaySwitch.setEnabled(true);

                if (binding.relaySwitch.isChecked()) {
                    uri = URI.create("ws://server.filipkin.com:9014/");
                    openWebSocket(eventInput);
                } else {
                    String requestUrl = "https://ftahelper.filipkin.com/register/" + URLEncoder.encode(eventInput, "UTF-8");
                    Fetch.get(requestUrl, new Callback() {
                        @Override
                        public void onFailure(@NonNull Call call, @NonNull IOException e) {
                            requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error connecting to cloud server", Toast.LENGTH_LONG).show());
                        }

                        @Override
                        public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                            if (response.code() == 404) {
                                requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Event code not found", Toast.LENGTH_SHORT).show());
                                return;
                            }
                            try {
                                JSONObject ipJson = new JSONObject(response.body().string());
                                uri = URI.create("ws://" + ipJson.getString("local_ip") + ":8284/");
                                openWebSocket();
                            } catch (JSONException e) {
                                requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error parsing JSON response from cloud server", Toast.LENGTH_LONG).show());
                            }
                        }
                    });
                }

            } catch (IOException e) {
                requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error URI encoding event code", Toast.LENGTH_LONG).show());
            }
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }

    private void openWebSocket() {
        openWebSocket(null);
    }
    
    private void openWebSocket(String eventInput) {
        Log.i("Websocket", "Connection initializing to " + uri.toString());
        firstConnection = true;
        if (ws != null && ws.open) ws.close();
        ws = new WebSocket(uri) {
            int failedConnections = 0;
            @Override
            public void onTextReceived(String s) {
                final String message = s;
                requireActivity().runOnUiThread(() -> {
                    Log.i("WebSocket", message);
                    try {
                        JSONObject jObject = new JSONObject(message);
                        if (!jObject.getString("type").equals("monitorUpdate")) return;
                        field.field = jObject.getInt("field");
                        field.match = jObject.getInt("match");
                        field.time = jObject.getString("time");

                        JSONObject blue1 = jObject.getJSONObject("blue1");
                        field.blue1.number = blue1.getInt("number");
                        field.blue1.ds = blue1.getInt("ds");
                        field.blue1.radio = blue1.getInt("radio");
                        field.blue1.rio = blue1.getInt("rio");
                        field.blue1.code = blue1.getInt("code");
                        field.blue1.bwu = blue1.getDouble("bwu");
                        field.blue1.battery = blue1.getDouble("battery");
                        field.blue1.ping = blue1.getInt("ping");
                        field.blue1.packets = blue1.getInt("packets");

                        JSONObject blue2 = jObject.getJSONObject("blue2");
                        field.blue2.number = blue2.getInt("number");
                        field.blue2.ds = blue2.getInt("ds");
                        field.blue2.radio = blue2.getInt("radio");
                        field.blue2.rio = blue2.getInt("rio");
                        field.blue2.code = blue2.getInt("code");
                        field.blue2.bwu = blue2.getDouble("bwu");
                        field.blue2.battery = blue2.getDouble("battery");
                        field.blue2.ping = blue2.getInt("ping");
                        field.blue2.packets = blue2.getInt("packets");

                        JSONObject blue3 = jObject.getJSONObject("blue3");
                        field.blue3.number = blue3.getInt("number");
                        field.blue3.ds = blue3.getInt("ds");
                        field.blue3.radio = blue3.getInt("radio");
                        field.blue3.rio = blue3.getInt("rio");
                        field.blue3.code = blue3.getInt("code");
                        field.blue3.bwu = blue3.getDouble("bwu");
                        field.blue3.battery = blue3.getDouble("battery");
                        field.blue3.ping = blue3.getInt("ping");
                        field.blue3.packets = blue3.getInt("packets");

                        JSONObject red1 = jObject.getJSONObject("red1");
                        field.red1.number = red1.getInt("number");
                        field.red1.ds = red1.getInt("ds");
                        field.red1.radio = red1.getInt("radio");
                        field.red1.rio = red1.getInt("rio");
                        field.red1.code = red1.getInt("code");
                        field.red1.bwu = red1.getDouble("bwu");
                        field.red1.battery = red1.getDouble("battery");
                        field.red1.ping = red1.getInt("ping");
                        field.red1.packets = red1.getInt("packets");

                        JSONObject red2 = jObject.getJSONObject("red2");
                        field.red2.number = red2.getInt("number");
                        field.red2.ds = red2.getInt("ds");
                        field.red2.radio = red2.getInt("radio");
                        field.red2.rio = red2.getInt("rio");
                        field.red2.code = red2.getInt("code");
                        field.red2.bwu = red2.getDouble("bwu");
                        field.red2.battery = red2.getDouble("battery");
                        field.red2.ping = red2.getInt("ping");
                        field.red2.packets = red2.getInt("packets");

                        JSONObject red3 = jObject.getJSONObject("red3");
                        field.red3.number = red3.getInt("number");
                        field.red3.ds = red3.getInt("ds");
                        field.red3.radio = red3.getInt("radio");
                        field.red3.rio = red3.getInt("rio");
                        field.red3.code = red3.getInt("code");
                        field.red3.bwu = red3.getDouble("bwu");
                        field.red3.battery = red3.getDouble("battery");
                        field.red3.ping = red3.getInt("ping");
                        field.red3.packets = red3.getInt("packets");

                        monitorViewModel.getField().setValue(field);
                    } catch (JSONException e) {
                        e.printStackTrace();
                    }

                });
            }

            @Override
            public void onOpen() {
                Log.i("Websocket", "Connection established");
                if (!firstConnection) return;
                firstConnection = false;
                if (eventInput != null) {
                    this.send("client-"+eventInput);
                }
                this.open = true;
                requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Connected to websocket", Toast.LENGTH_SHORT).show());

                // Keep alive ping every minute
                new Timer().scheduleAtFixedRate(new TimerTask() {
                    @Override
                    public void run() {
                        ws.send("ping");
                    }
                }, 0, 60000);
            }

            @Override
            public void onException(Exception e) {
                failedConnections++;
                if (failedConnections == 3) {
                    this.close();
                }
                System.out.println(e.getMessage());
                requireActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Error connecting " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        };
    }
}