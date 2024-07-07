// Copyright (c) 2016-2024, Jörg Knobloch. All rights reserved.

/* global Services */

const { ThreadPaneColumns } = ChromeUtils.importESModule(
  "chrome://messenger/content/thread-pane-columns.mjs",
);

var freq;
var numMsgs;
var folder;
var isSent;
var noFreq;
var compareEmailOnly;

function getAddress(aHeader) {
  // .recipients and .author return the raw message header
  // which can still be RFC 2047 encoded.
  // When using these attributes, we simply extract the e-mail address
  // from between the angle brackets <huhu@huhu.com>.
  // .mime2DecodedRecipients and .mime2DecodedAuthor return the
  // "pretty" version, where RFC 2047 has been decoded.
  // In the case we just remove " from the string so
  // |"huhu" <huhu@huhu.com>| and |huhu <huhu@huhu.com>| are the same thing.
  let from;
  if (compareEmailOnly) {
    from = isSent ? aHeader.recipients : aHeader.author;
    from = from.replace(/.*</, "").replace(/>.*/, "");
  } else {
    from = isSent ? aHeader.mime2DecodedRecipients
      : aHeader.mime2DecodedAuthor;
    from = from.replace(/"/g, "");
  }
  return from;
}

var SFreqHdrView = {
  sortValueForHdr(hdr) { // Numeric value.
    // @John:
    // This API is pretty horrible.
    // How can you request the text or sort order before the view is ready?
    if (!this.win.gDBView) return "";
    if (this.win.gViewWrapper.searching) return "";

    if (freq === undefined) return "";
    if (noFreq) return "";
    if (folder != this.win.gFolder || numMsgs != this.win.gDBView.numMsgsInView) this.cacheFreq();
    let from = getAddress(hdr);
    if (freq[from] === undefined) {
      freq[from] = 1;
    }
    return freq[from];
  },

  cacheFreq() {
    freq = [];
    numMsgs = 0;
    isSent = false;
    noFreq = false;

    folder = this.win.gFolder;
    if (!folder) {
      noFreq = true;
      return;
    }
    if (folder.isSpecialFolder(Ci.nsMsgFolderFlags.SentMail, true)) isSent = true;

    // Skip grouped views.
    if (this.win.gDBView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort) {
      noFreq = true;
      return;
    }
    numMsgs = this.win.gDBView.numMsgsInView;
    for (let i = 0; i < numMsgs; i++) {
      try {
        let from = getAddress(this.win.gDBView.getMsgHdrAt(i));
        if (freq[from] === undefined) {
          freq[from] = 1;
        } else {
          freq[from]++;
        }
      } catch (e) {
        console.error(e);
      }
    }

    this.setButton();
  },

  setButton() {
    let button = this.win.document.getElementById("SFreq-columnButton");
    if (button) {
      button.textContent = isSent ? "RFreq" : "SFreq";
      button.title = isSent ? "Sort by Recipient frequency" : "Sort by Sender frequency";
    }
  },

  async init(win) {
    // The following call needs tabmail setup, so it won't work straight away.
    // It would be nice to listen to "mail-startup-done", but that only fires for the first window.
    // So let's wait for tabmail and all the other stuff we need.
    let count = 0;
    while (
      count++ < 50 &&
      // .currentAbout3Pane throws if .currentTabInfo isn't available yet, so test it first.
      !(
        win.document.getElementById("tabmail")?.currentTabInfo &&
        win.document.getElementById("tabmail")?.currentAbout3Pane?.gFolder
      )
    ) {
      await new Promise(r => win.setTimeout(r, 100));
    }
    this.win = win.document.getElementById("tabmail")?.currentAbout3Pane;

    // Set default preference.
    let defaultsBranch = Services.prefs.getDefaultBranch("extensions.Sfreq.");
    defaultsBranch.setBoolPref("compareEmailOnly", true);
    let valuesBranch = Services.prefs.getBranch("extensions.Sfreq.");
    compareEmailOnly = valuesBranch.getBoolPref("compareEmailOnly");

    this.cacheFreq();

    ThreadPaneColumns.addCustomColumn("SFreq-column", {
      name: "SFreq",
      resizable: true,
      sortable: true,
      // The sortCallback is used for numeric sort.
      sortCallback: (msgHdr) => this.sortValueForHdr(msgHdr),
      textCallback: (msgHdr) => this.sortValueForHdr(msgHdr).toString(),
    });

    this.setButton();
  },

  destroy() {
    ThreadPaneColumns.removeCustomColumn("SFreq-column");
  },
};
