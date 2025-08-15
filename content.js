(function () {
  "use strict";

  const FLASHCARD_BUTTON_ID = "flashcard-generator-button";
  const FLASHCARD_CONTAINER_ID = "flashcard-generator-container";
  const FLASHCARD_PROMPT = `You are an expert flashcard engineer. Transform the provided source content into high-quality, one-fact-per-card flashcards for efficient learning.

        Instructions:
        - Output ONLY the flashcards, one per line, in the format: "Front";"Back"
        - Each card MUST be on its own line.
        - Do NOT combine cards on one line. Do NOT separate cards with spaces.
        - Do NOT add any headers, intro texts, explanations, or closing statements.
        - Do NOT include anything except the flashcards.
        - Do NOT wrap the output in Markdown, tables, or any other format.
        - Do NOT add numbering, timestamps, or any extra notes.

        Examples:
        "The Eiffel Tower is located in {{c1::Paris}}.";"Located in Paris."
        "Q: In which city is the Eiffel Tower located?";"A: Paris."
        `;

  const RESPONSE_TIMEOUT_MS = 600000; // 10 minutes

  // Helper: Style request message ("Generating Flashcards")
  const styleRequestMessage = () => {
    const messages = document.querySelectorAll("chat-message");
    if (!messages.length) return;
    // Find last user message (should be the one just sent)
    for (let i = messages.length - 1; i >= 0; --i) {
      const userContainer = messages[i].querySelector(".from-user-container");
      if (userContainer) {
        const requestTextElement = userContainer.querySelector(
          ".message-text-content"
        );
        if (requestTextElement) {
          requestTextElement.innerText = "🧠 Generating Flashcards...";
          requestTextElement.style.padding = "1.3em 1em";
          requestTextElement.style.fontWeight = "700";
          requestTextElement.style.borderRadius = "10px";
          requestTextElement.style.margin = "1em auto";
          requestTextElement.style.maxWidth = "500px";
          requestTextElement.style.border = "2px solid #44bba4";
          requestTextElement.style.fontFamily = "monospace";
          requestTextElement.style.fontSize = "1.1em";
          requestTextElement.style.textAlign = "center";
          requestTextElement.style.boxShadow =
            "0 2px 12px 0 rgba(68,187,164,0.13)";
        }
        break;
      }
    }
  };

  // Helper: After download, replace output with "Download Complete" in styled box
  const showDownloadComplete = () => {
    const messages = document.querySelectorAll("chat-message");
    if (!messages.length) return;
    const latestMessage = messages[messages.length - 1];
    const responseContainer = latestMessage.querySelector(".to-user-container");
    if (!responseContainer) return;
    const responseTextElement = responseContainer.querySelector(
      ".message-text-content"
    );
    if (!responseTextElement) return;

    responseTextElement.classList.remove("anki-output-ignore");
    responseTextElement.classList.add("anki-output-ignore");
    responseTextElement.innerText = "✅ Flashcards Download Complete";
    responseTextElement.style.background =
      "linear-gradient(90deg,#fff 0%,#e3e6ed 100%)";
    responseTextElement.style.color = "#44bba4";
    responseTextElement.style.borderRadius = "10px";
    responseTextElement.style.maxWidth = "700px";
    responseTextElement.style.boxShadow = "0 2px 24px 0 rgba(0,0,0,.15)";
    responseTextElement.style.border = "2.5px solid #fff";
    responseTextElement.style.fontFamily = "monospace";
    responseTextElement.style.fontSize = "1.1em";
    responseTextElement.style.fontWeight = "bold";
  };

  // Download only valid flashcard lines in "Front";"Back" format
  const downloadFlashcards = (responseText) => {
    // Regex to match all valid "Front";"Back" pairs globally
    // We'll insert a newline between each match for clarity

    // This will find all matches of the pattern
    const matches = responseText.match(/"[^"]+?";"[^"]+?"/g);

    if (!matches || !matches.length) {
      alert(
        "No flashcards found for export. Please check the AI output format."
      );
      return;
    }

    // Join with newlines so each card is on its own line for Anki
    // Optionally insert a tab or something else if you prefer, but newline is the standard for Anki import
    const ankiData = matches.join("\n");

    const blob = new Blob([ankiData], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anki-import.txt";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // After download, visually show "Download Complete" in response field
    showDownloadComplete();
  };

  const startFlashcardGeneration = async () => {
    const button = document.getElementById(FLASHCARD_BUTTON_ID);
    if (!button || button.disabled) return;

    button.disabled = true;
    const icon = button.querySelector("mat-icon");
    const originalIcon = icon.textContent;
    icon.textContent = "hourglass_top";

    try {
      const initialMessageCount =
        document.querySelectorAll("chat-message").length;
      const promptTextarea = document.querySelector(
        'textarea.query-box-input[aria-label="Query box"]'
      );
      const sendButton = document.querySelector(
        'button.submit-button[aria-label="Submit"]'
      );

      if (!promptTextarea || !sendButton) {
        throw new Error(
          "Could not find the prompt input or send button. The interface may have changed again."
        );
      }

      promptTextarea.value = FLASHCARD_PROMPT;
      promptTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      promptTextarea.dispatchEvent(new Event("change", { bubbles: true }));

      let tries = 0;
      while (sendButton.disabled && tries < 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        tries++;
      }
      if (sendButton.disabled) {
        throw new Error("Send button is still disabled after typing.");
      }

      sendButton.click();

      // Style the outgoing request message
      setTimeout(styleRequestMessage, 300);

      // Wait for and process response
      const responseText = await waitForResponseCompletion(initialMessageCount);

      downloadFlashcards(responseText);
    } catch (error) {
      console.error("Flashcard Generation Error:", error);
      alert(`An error occurred: ${error.message}`);
    } finally {
      button.disabled = false;
      icon.textContent = originalIcon;
    }
  };

  // Wait for model response
  const waitForResponseCompletion = (initialMessageCount) => {
    return new Promise((resolve, reject) => {
      let lastText = "";
      let stabilityCounter = 0;
      const STABILITY_THRESHOLD = 5;

      const intervalId = setInterval(() => {
        const messages = document.querySelectorAll("chat-message");
        if (messages.length <= initialMessageCount) {
          return;
        }
        const latestMessage = messages[messages.length - 1];
        const responseContainer =
          latestMessage.querySelector(".to-user-container");
        if (!responseContainer) return;

        const responseTextElement = responseContainer.querySelector(
          ".message-text-content"
        );
        let currentText = "";

        if (responseTextElement) {
          const spans = responseTextElement.querySelectorAll("span, div");
          if (spans.length > 0) {
            spans.forEach((el) => {
              if (el.innerText && el.innerText.trim()) {
                currentText += el.innerText.trim() + "\n";
              }
            });
            currentText = currentText.trim();
          } else {
            currentText = responseTextElement.innerText.trim();
          }

          if (currentText === lastText && currentText.length > 0) {
            stabilityCounter++;
          } else {
            stabilityCounter = 0;
          }
          lastText = currentText;

          if (stabilityCounter >= STABILITY_THRESHOLD) {
            clearInterval(intervalId);
            resolve(currentText);
          }
        }
      }, 500);

      setTimeout(() => {
        clearInterval(intervalId);
        reject(
          new Error(
            `Response generation timed out after ${
              RESPONSE_TIMEOUT_MS / 60000
            } minutes.`
          )
        );
      }, RESPONSE_TIMEOUT_MS);
    });
  };

  // --- UI INJECTION ---
  const createFlashcardButton = () => {
    if (document.getElementById(FLASHCARD_BUTTON_ID)) {
      return;
    }
    const shareButtonContainer = document.querySelector(
      "div.share-button-container"
    );
    if (shareButtonContainer && shareButtonContainer.parentElement) {
      const wrapperDiv = document.createElement("div");
      wrapperDiv.id = FLASHCARD_CONTAINER_ID;
      wrapperDiv.className = shareButtonContainer.className;

      const button = document.createElement("button");
      button.id = FLASHCARD_BUTTON_ID;
      button.className =
        "mdc-fab mat-mdc-fab-base mat-mdc-fab mat-mdc-button-base mat-primary";
      button.className += " mdc-fab--extended mat-mdc-extended-fab";
      button.setAttribute(
        "aria-label",
        "Generate and Download Anki Flashcards"
      );
      button.addEventListener("click", startFlashcardGeneration);

      const icon = document.createElement("mat-icon");
      icon.className =
        "mat-icon notranslate google-symbols mat-icon-no-color fab-icon";
      icon.setAttribute("role", "img");
      icon.textContent = "style";

      button.appendChild(icon);
      wrapperDiv.appendChild(button);

      shareButtonContainer.parentElement.insertBefore(
        wrapperDiv,
        shareButtonContainer
      );
    }
  };

  const observer = new MutationObserver(() => {
    if (!document.getElementById(FLASHCARD_BUTTON_ID)) {
      createFlashcardButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
