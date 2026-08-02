<script lang="ts">
  import { onMount } from "svelte";
  import {
    attachment_import_bytes,
    attachment_resolve,
    errorMessage,
    search_filename,
    type ImportedAttachment,
    url_open_external,
  } from "../api";
  import { createMarkdownEditor, type MarkdownEditor } from "../editor";
  import {
    imageAlt,
    isImagePath,
    markdownImage,
    relativeVaultPath,
    resolveVaultAsset,
  } from "../editor/paths";
  import { attachmentMarkdown } from "../editor/attachments";
  import {
    replaceMarkdownBody,
    splitFrontmatter,
  } from "../markdown/frontmatter";
  import { settingsState } from "../stores/settings.svelte";
  import {
    activeTab,
    findPane,
    setTagFilter,
    showToast,
    updateTabPosition,
    uiState,
  } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import { markdownLink, notePathFromDrag, type NotemDrag } from "../drag";
  import { internalDropTarget, type DragPoint } from "../internalDrag";
  import { parsePdfTarget, pdfEmbedMarkdown } from "../pdf/targets";

  let { path, paneId }: { path: string; paneId: string } = $props();
  let host: HTMLDivElement;
  let editor: MarkdownEditor | null = null;
  const file = $derived(vaultState.files[path]);
  const document = $derived(splitFrontmatter(file?.content ?? ""));

  onMount(() => {
    if (!file) return;
    const tab = activeTab(findPane(paneId));
    editor = createMarkdownEditor({
      sourcePath: path,
      parent: host,
      doc: document.body,
      fontSize: settingsState.editorFontSize,
      font: settingsState.editorFont,
      readableLineLength: settingsState.readableLineLength,
      lineWidth: settingsState.editorLineWidth,
      spellcheck: settingsState.spellcheck,
      highlightActiveLine: settingsState.highlightActiveLine,
      initialCursor: Math.max(0, (tab?.cursor ?? 0) - document.bodyOffset),
      initialScrollTop: tab?.scrollTop,
      onPosition: (cursor, scrollTop) =>
        updateTabPosition(paneId, cursor + document.bodyOffset, scrollTop),
      onChange: (content) => {
        const current = vaultState.files[path];
        if (current) {
          vaultState.updateContent(
            path,
            replaceMarkdownBody(current.content, content),
          );
        }
      },
      openWikilink: (target, newTab) => {
        void vaultState
          .openWikilink(target, newTab, path)
          .catch((error: unknown) => showToast(errorMessage(error)));
      },
      openPdf: (target, newTab) => {
        const pdf = parsePdfTarget(target);
        if (!pdf) return;
        void attachment_resolve(path, pdf.source)
          .then(async (resolution) => {
            if (resolution.status === "resolved" && resolution.path) {
              await vaultState.openPdf(resolution.path, pdf.page, newTab);
            } else {
              showToast(
                resolution.status === "ambiguous"
                  ? `More than one file matches ${pdf.source}`
                  : `PDF not found: ${pdf.source}`,
              );
            }
          })
          .catch((error: unknown) => showToast(errorMessage(error)));
      },
      openExternal: (url) => {
        void url_open_external(url).catch((error: unknown) =>
          showToast(errorMessage(error)),
        );
      },
      selectTag: setTagFilter,
      imageUrl: assetUrl,
      importPastedFiles: (files) => void importPastedFiles(files),
      searchNotes: (query) => search_filename(query, 50),
    });
    return () => {
      editor?.destroy();
      editor = null;
    };
  });

  $effect(() => {
    if (file) editor?.setDocument(document.body);
  });

  $effect(() => {
    editor?.setReadOnly(vaultState.updateInstallationLocked);
  });

  $effect(() => {
    editor?.updateSettings({
      fontSize: settingsState.editorFontSize,
      font: settingsState.editorFont,
      readableLineLength: settingsState.readableLineLength,
      lineWidth: settingsState.editorLineWidth,
      spellcheck: settingsState.spellcheck,
      highlightActiveLine: settingsState.highlightActiveLine,
    });
  });

  let handledJump = 0;
  $effect(() => {
    const jump = uiState.editorJump;
    if (!jump || jump.path !== path || jump.id === handledJump) return;
    handledJump = jump.id;
    editor?.jumpToLine(
      Math.max(1, jump.line - document.bodyLineOffset),
      jump.start === undefined
        ? undefined
        : Math.max(0, jump.start - document.bodyOffset),
      jump.end === undefined
        ? undefined
        : Math.max(0, jump.end - document.bodyOffset),
    );
  });

  let handledInsertion = 0;
  $effect(() => {
    const insertion = uiState.editorInsertion;
    if (
      !insertion ||
      insertion.path !== path ||
      (insertion.paneId !== undefined && insertion.paneId !== paneId) ||
      insertion.id === handledInsertion
    )
      return;
    handledInsertion = insertion.id;
    if (vaultState.updateInstallationLocked) return;
    if (insertion.clientX !== undefined && insertion.clientY !== undefined) {
      const position = editor?.view.posAtCoords({
        x: insertion.clientX,
        y: insertion.clientY,
      });
      if (position !== null && position !== undefined) {
        editor?.view.dispatch({ selection: { anchor: position } });
      }
    }
    editor?.insert(insertion.content);
  });

  function assetUrl(relativePath: string): string | null {
    if (!vaultState.path) return null;
    return resolveVaultAsset(vaultState.path, path, relativePath);
  }

  async function importPastedFiles(files: File[]): Promise<void> {
    if (vaultState.updateInstallationLocked) return;
    let imported = false;
    for (const [index, file] of files.entries()) {
      try {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const name = pastedFileName(file, index);
        insertAttachment(await attachment_import_bytes(path, name, bytes));
        imported = true;
      } catch (error) {
        showToast(errorMessage(error));
      }
    }
    if (imported) await vaultState.refreshTree();
  }

  function pastedFileName(file: File, index: number): string {
    if (file.name && file.name !== "image" && file.name.includes(".")) {
      return file.name;
    }
    const extension =
      {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        "image/avif": "avif",
      }[file.type] ?? "bin";
    return `Pasted image ${Date.now()}${index ? ` ${index}` : ""}.${extension}`;
  }

  function insertAttachment(attachment: ImportedAttachment): void {
    editor?.insert(attachmentMarkdown(attachment));
  }

  function draggedNotePath(payload: NotemDrag): string | null {
    const note = notePathFromDrag(payload);
    if (note) return note;
    if (payload.kind !== "tab") return null;
    return (
      findPane(payload.paneId)?.tabs.find(
        (candidate) => candidate.id === payload.tabId,
      )?.path ?? null
    );
  }

  function draggedMediaPath(payload: NotemDrag): string | null {
    return payload.kind === "entry" &&
      payload.entryKind === "file" &&
      (isImagePath(payload.path) || parsePdfTarget(payload.path))
      ? payload.path
      : null;
  }

  function acceptsInternalDrop(payload: NotemDrag): boolean {
    return (
      draggedNotePath(payload) !== null || draggedMediaPath(payload) !== null
    );
  }

  function insertDraggedItem(payload: NotemDrag, point: DragPoint): void {
    if (!editor || vaultState.updateInstallationLocked) return;
    const draggedMedia = draggedMediaPath(payload);
    const draggedNote = draggedNotePath(payload);
    const relativeMedia = draggedMedia
      ? relativeVaultPath(path, draggedMedia)
      : null;
    if (!draggedNote && !relativeMedia) return;
    const position =
      editor.view.posAtCoords({ x: point.clientX, y: point.clientY }) ??
      editor.view.state.selection.main.head;
    const content = relativeMedia
      ? parsePdfTarget(relativeMedia)
        ? `${pdfEmbedMarkdown(relativeMedia)}\n`
        : `${markdownImage(relativeMedia, imageAlt(relativeMedia))}\n`
      : markdownLink(draggedNote!, point.altKey);
    try {
      editor.view.dispatch({
        changes: { from: position, insert: content },
        selection: { anchor: position + content.length },
        scrollIntoView: true,
      });
      editor.view.focus();
    } catch (error) {
      showToast(`Could not insert dropped item: ${errorMessage(error)}`);
    }
  }
</script>

<div
  class="note-editor"
  bind:this={host}
  role="textbox"
  tabindex="-1"
  aria-multiline="true"
  aria-label={`Editing ${path}`}
  use:internalDropTarget={{
    accepts: acceptsInternalDrop,
    priority: 50,
    drop: insertDraggedItem,
  }}
></div>
