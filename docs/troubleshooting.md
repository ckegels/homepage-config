# Troubleshooting

← [Back to README](../README.md)

| Problem | Fix |
| ------- | --- |
| `apt install` gives `404 Not Found` | Outdated package lists: run `apt update` first |
| Lost the setup token | `journalctl -u homepage-config` / `docker logs homepage-config`, or `cat <data dir>/setup-token.txt` |
| Forgot the password | Stop the service, delete `<data dir>/auth.json`, start it again and use the new setup token |
| "Cannot write …" when saving | The app can't write Homepage's folder. LXC: `./scripts/install-lxc.sh --fix-permissions`. Docker: set `user:` to the folder owner |
| "Too many failed attempts" | Wait for the shown time (doubles per failure, max 1 h), or restart the service |
| New icon shows as broken | Local mode: restart Homepage (button on the *Icons* page). Or switch to "served by this app" (*Account & app*) |
| Changes don't show on Homepage | Reload the Homepage page; it rereads the files on every load. YAML errors show on the *Overview* page |
| "Homepage rejected the host" | Add the host to `HOMEPAGE_ALLOWED_HOSTS` (*Environment & auth*) |
| Homepage won't start after an `.env` change | Fix or undo the value on *Environment & auth* (backups are in `<data dir>/backups/homepage.env/`), then restart |
| LXC service won't start | `journalctl -u homepage-config -n 50`. If it mentions `NAMESPACE`, enable nesting on the LXC or re-run the installer |
| Homepage update broke saving (LXC) | `./scripts/install-lxc.sh --fix-permissions` |

Still stuck? [Open an issue](https://github.com/ckegels/homepage-config/issues) with the log output.
