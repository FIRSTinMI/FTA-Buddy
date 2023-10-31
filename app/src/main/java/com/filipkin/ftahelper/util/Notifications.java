package com.filipkin.ftahelper.util;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.filipkin.ftahelper.R;

public class Notifications {

    private final static long[] DSvibrationPattern = new long[]{500, 200, 300};
    private final static long[] vibrationPattern = new long[]{500};

    public static void createNotificationChannels(Context context) {
        final NotificationChannel DSchannel = new NotificationChannel("DS_NOTIFICATION", "Driverstation Notifications", NotificationManager.IMPORTANCE_DEFAULT);
        DSchannel.setDescription("Shows notifications whenever a driverstation drops during a match");
        DSchannel.setVibrationPattern(DSvibrationPattern);
        DSchannel.enableVibration(true);

        final NotificationChannel channel = new NotificationChannel("FIELD_NOTIFICATION", "Field Notifications", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Shows notifications whenever a robot status drops during a match");
        channel.setVibrationPattern(vibrationPattern);
        channel.enableVibration(true);

        final NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (notificationManager != null) {
            notificationManager.createNotificationChannel(channel);
            notificationManager.createNotificationChannel(DSchannel);
        }
    }
    public static void makeStatusNotification(boolean driverStation, String message, Context context) {
        createNotificationChannels(context);

        // Create the notification
        final NotificationCompat.Builder builder =
                new NotificationCompat.Builder(context, (driverStation) ? "DS_NOTIFICATION":"FIELD_NOTIFICATION")
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle("Field Monitor")
                        .setContentText(message)
                        .setVibrate((driverStation) ? DSvibrationPattern:vibrationPattern)
                        .setAutoCancel(true);

        // Show the notification
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            // TODO: Consider calling
            //    ActivityCompat#requestPermissions
            // here to request the missing permissions, and then overriding
            //   public void onRequestPermissionsResult(int requestCode, String[] permissions,
            //                                          int[] grantResults)
            // to handle the case where the user grants the permission. See the documentation
            // for ActivityCompat#requestPermissions for more details.
            return;
        }
        NotificationManagerCompat.from(context).notify(1, builder.build());
    }
}
