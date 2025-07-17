# Privacy Policy

## Google Meet Chat to Clipboard Extension

**Last Updated:** July 17, 2025  
**Version:** 5.1.0

### Overview

This Privacy Policy describes how the Google Meet Chat to Clipboard extension ("Extension", "we", "us", or "our") handles information when you use our Chrome extension. We are committed to protecting your privacy and being transparent about our data practices.

### Information We Collect

**We do not collect, store, or transmit any personal information or data.**

This extension operates entirely locally on your device and does not:
- Collect any personal information
- Store any data on external servers
- Transmit any information to third parties
- Track user behavior or usage patterns
- Access any data outside of Google Meet chat messages

### How the Extension Works

The extension only accesses and processes:
- Google Meet chat messages displayed in your browser
- DOM elements within Google Meet's interface
- Clipboard functionality for copying chat content

All processing occurs locally on your device, and no data is sent to external servers.

### Data Processing

When you use the extension:
1. **Chat Message Access**: The extension reads chat messages from Google Meet's interface using content scripts
2. **Local Processing**: Chat messages are processed locally to format them for clipboard copying
3. **Clipboard Access**: Formatted chat content is copied to your system clipboard
4. **Temporary Storage**: Chat content may be temporarily stored in your browser's memory during processing, but is not persisted

### Permissions

The extension requires the following permissions:
- **clipboardWrite**: To copy chat messages to your system clipboard
- **Content Script Access to meet.google.com**: To interact with Google Meet's interface and extract chat messages

These permissions are used solely for the extension's core functionality and are not used for any other purposes.

### Data Retention

- No data is permanently stored by the extension
- Chat messages are only held in memory temporarily during the copying process
- No chat history or user data is retained after the extension is used

### Third-Party Services

This extension does not integrate with or send data to any third-party services. It operates independently and only interacts with:
- Google Meet's web interface (for reading chat messages)
- Your system's clipboard (for copying functionality)

### Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this policy. We encourage you to review this policy periodically.

### Contact Information

If you have any questions about this Privacy Policy or the extension's data practices, please contact us through the Chrome Web Store or create an issue in our GitHub repository.

### Data Protection Rights

Since we do not collect or store any personal data, there is no personal information to access, modify, or delete. The extension processes data locally and temporarily as described above.

### Compliance

This extension is designed to comply with:
- Chrome Web Store policies
- General privacy best practices
- Local data processing principles

### Technical Details

For developers and technical users, the extension:
- Uses Manifest V3 for enhanced security
- Operates only with content scripts (no background processes collecting data)
- Implements local-only processing without external API calls
- Uses standard web APIs (Clipboard API, DOM manipulation) without additional tracking

---

**Note**: This privacy policy applies specifically to the Google Meet Chat to Clipboard extension. It does not cover Google Meet itself or any other services you may use in conjunction with this extension.