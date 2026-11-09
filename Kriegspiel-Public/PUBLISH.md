# Publish to GitHub

Create an empty public repository on GitHub, then copy its HTTPS URL. Run these commands from the parent folder containing both Kriegspiel-Public and Kriegspiel-TTS-Assets. The local repository already has its initial commit.

```sh
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

See [GitHub’s guide to uploading an existing project](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github). The [artwork credits](ARTWORK.md) describe the license for the tracked source artwork. Choose a code license separately if you want to grant reuse rights for the application code.
