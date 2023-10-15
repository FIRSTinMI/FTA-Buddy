package com.filipkin.ftahelper.util;

import android.util.Log;

import java.net.URI;

import tech.gusavila92.websocketclient.WebSocketClient;

public class WebSocket extends WebSocketClient {
    public boolean open = false;
    public WebSocket(URI uri) {
        super(uri);

        this.setConnectTimeout(10000);
        this.setReadTimeout(60000);
        this.enableAutomaticReconnection(5000);
        this.connect();
    }
    @Override
    public void onOpen() {
        Log.i("WebSocket", "Session is starting");
        open = true;
    }

    @Override
    public void onTextReceived(String s) {
        Log.i("WebSocket", s);
    }

    @Override
    public void onBinaryReceived(byte[] data) {
    }

    @Override
    public void onPingReceived(byte[] data) {
    }

    @Override
    public void onPongReceived(byte[] data) {
    }

    @Override
    public void onException(Exception e) {
        System.out.println(e.getMessage());
    }

    @Override
    public void onCloseReceived() {
        Log.i("WebSocket", "Closed ");
    }

}
