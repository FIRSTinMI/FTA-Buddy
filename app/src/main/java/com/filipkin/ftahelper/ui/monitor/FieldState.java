package com.filipkin.ftahelper.ui.monitor;

public class FieldState {
    public int field = 0;
    public int match = 0;
    public String time = "unk";
    public TeamState blue1 = new TeamState() {};
    public TeamState blue2 = new TeamState() {};
    public TeamState blue3 = new TeamState() {};
    public TeamState red1 = new TeamState() {};
    public TeamState red2 = new TeamState() {};
    public TeamState red3 = new TeamState() {};
}

class TeamState {
    public int number = 0;
    public int ds = 0;
    public int radio = 0;
    public int rio = 0;
    public int code = 0;
    public double bwu = 0;
    public double battery = 0;
    public int ping = 0;
    public int packets = 0;
}