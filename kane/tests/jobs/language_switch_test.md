---
url: https://keel-jobs-staging.merjkerm.workers.dev
tags: [jobs, i18n]
max_steps: 35
timeout: 180
---

# Switching language translates everything on screen, including an error

## Open Keel Jobs in English
Open the page and click the EN button.

## Trigger an error
Scroll down and click Send without filling anything. Verify the message under the Send button reads "Add your name or handle.".

## Switch to Portuguese
Scroll to the top and click the PT button. Verify the heading starts with "Faça uma tarefa de 3 minutos".
Scroll down to the Send button and verify the message under it now reads "Coloque seu nome ou @." (Portuguese), not English.

## Switch to Spanish
Scroll to the top and click the ES button. Scroll down to the Send button and verify the message under it reads "Pon tu nombre o @.".
