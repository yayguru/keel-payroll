---
url: https://keel-jobs.merjkerm.workers.dev
tags: [jobs, i18n]
max_steps: 35
timeout: 180
---

# Switching language translates everything on screen, including an error

## Open Keel Jobs in English
Open the page and click the EN button.

## Trigger an error
Click Send without filling anything. Verify "Add your name or handle." is shown.

## Switch to Portuguese
Click the PT button. Verify the heading is in Portuguese ("Faça uma tarefa de 3 minutos").
Verify the error message on screen is now in Portuguese ("Coloque seu nome ou @."), not English.

## Switch to Spanish
Click the ES button. Verify the heading and the safety note are in Spanish and the error says "Pon tu nombre o @.".
