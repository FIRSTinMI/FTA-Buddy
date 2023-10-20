# FTA Buddy [![code with love by Filip-Kin](https://img.shields.io/badge/%3C%2F%3E_with_%E2%99%A5_by-Filip_Kin-FF1414?style=flat-square)](https://github.com/Filip-Kin)
<img src="shared/logo.svg" alt="Logo" width="120" height="120">

<a href="https://play.google.com/store/apps/details?id=com.filipkin.ftahelper"><strong>Open on Google Play</strong></a>
<br />
<a href="https://github.com/Filip-Kin/fta-buddy/issues/new?assignees=&labels=bug&template=01_BUG_REPORT.md&title=bug%3A+">Report a Bug</a>
·
<a href="https://github.com/Filip-Kin/fta-buddy/issues/new?assignees=&labels=enhancement&template=02_FEATURE_REQUEST.md&title=feat%3A+">Request a Feature</a>

<details open="open">
<summary>Table of Contents</summary>

- [About](#about)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

</details>

---

## About

This project was inspired by the [original FTA Buddy](https://github.com/kenschenke/FTA-Buddy-Android) app made by Ken Schenke.
It has since evolved to have a more mobile friendly field monitor, custom flashcards, more information in the reference page, and a notes section for communicating with other FTA(A)s and CSAs at events.
The field monitor uses a Chrome extension installed on a computer on the field network to scrape data. The extension sends the data to a locally run server that broadcasts it to the app through a websocket. It also sends that data to the cloud server, that way you can give volunteers a portable field monitor without having them on the field network. Plus, having fewer SignalR connections is always a good thing.
The cloud server also enables the notes functionality. The notes are also persistent between events, so if you have a team with a weird problem you can leave a note and the FTA at their next event can benefit!

## Getting Started

- Download latest release of local server and extension on laptop that will be hosting (probably FTA laptop).
- To install the extension
    - Unzip it to a folder
    - Go to the [extensions page](chrome://extensions)
    - Enable developer mode (top right corner)
    - Click `Load unpacked` and browse to where you unzipped the folder
- Run the local server and enter event code when prompted in the window (e.g. 2023mitry).
    - The IP address of the laptop is automatically queried and sent to the cloud server. If it happens to grab the wrong NIC you can specify the local ip manually with the `--ip` flag.
    - You can also set the event code with a `-e` flag.
- Install the (android app)[https://play.google.com/store/apps/details?id=com.filipkin.ftahelper] ~~or visit the (web app)[https://ftabuddy.filipkin.com]~~ WIP
- Enter the event code or the ip address of the local server (event code needed for notes functionality).
- When on the field network you can connect directly to the local server, if your phone is not on the field network you can turn on the relay switch and get field monitor data from the cloud server.

## Contributing

Pull requests are welcome, my code style standards are non-existant so I will accept anything as long as it works.

## License

This project is licensed under the **MIT license**.

See [LICENSE](LICENSE) for more information.

## Acknowledgements

Thanks to Ken Schenke for the inspiration to make this app, and to the many FIM FTAs that have helped me learn how to troubleshoot robots and make volunteering an enjoyable experience.
