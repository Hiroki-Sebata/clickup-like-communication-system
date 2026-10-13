# Put these two files in your PRIVATE data repository

These workflows do **not** belong in this repository. They belong in the private
repo that holds your tasks (your issues), because that is where the events happen.

Copy them like this:

```
your-private-repo/
  .github/
    workflows/
      telegram.yml        <- copy from here
      daily_digest.yml    <- copy from here
```

Then set up the secrets — see the "Telegram" section of the main README, one
folder up.
