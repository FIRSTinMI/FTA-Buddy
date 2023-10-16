package com.filipkin.ftahelper.util;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

public class Fetch {
    private static OkHttpClient client = new OkHttpClient();

    public static Call get(String url, Callback callback) {
        Request request = new Request.Builder()
                .url(url)
                .build();
        Call call = client.newCall(request);
        call.enqueue(callback);
        return call;
    }

    public static Call post(String url, String body, Callback callback) {
        Request request = new Request.Builder()
                .url(url)
                .post(RequestBody.create(body, MediaType.parse("application/json; charset=utf-8")))
                .build();
        Call call = client.newCall(request);
        call.enqueue(callback);
        return call;
    }
}
