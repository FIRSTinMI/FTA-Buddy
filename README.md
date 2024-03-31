# FTA Buddy
<img src="shared/logo.svg" alt="Logo" width="120" height="120">

<a href="https://ftabuddy.com/"><strong>Web App</strong></a>
<br />
<a href="https://github.com/Filip-Kin/fta-buddy/issues/new?assignees=&labels=bug&template=01_BUG_REPORT.md&title=bug%3A+">Report a Bug</a>
·
<a href="https://github.com/Filip-Kin/fta-buddy/issues/new?assignees=&labels=enhancement&template=02_FEATURE_REQUEST.md&title=feat%3A+">Request a Feature</a>

---

## About

This project was inspired by the [original FTA Buddy](https://github.com/kenschenke/FTA-Buddy-Android) app made by Ken Schenke.
It has since evolved to have a more mobile friendly field monitor, custom flashcards, more information in the reference page, and a notes section for communicating with other FTA(A)s and CSAs at events.
The field monitor uses a Chrome extension installed on a computer on the field network to scrape data. The extension sends the data to a locally run server that broadcasts it to the app through a websocket. It also sends that data to the cloud server, that way you can give volunteers a portable field monitor without having them on the field network. Plus, having fewer SignalR connections is always a good thing.
The cloud server also enables the notes functionality. The notes are also persistent between events, so if you have a team with a weird problem you can leave a note and the FTA at their next event can benefit!

## Getting Started

- Go to the [web app](https://ftabuddy.com/) on your phone, and click install app.
- Login or create an account
- Enter the event code (e.g. 2024miket) and a passcode of your choosing, and click create event
- Install the extension from the [Chrome webstore](https://chrome.google.com/webstore/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc)
- Enter the event code into the extension, click enable, and open the field monitor
- Refresh the app and it should be working

## License

This project is licensed under the **MIT license**.

See [LICENSE](LICENSE) for more information.
