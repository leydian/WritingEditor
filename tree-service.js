(function initTreeService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TreeService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createTreeActions(deps = {}) {
    const {
      state,
      getDoc,
      openInputDialog,
      openConfirmDialog,
      openNoticeDialog,
      addHistoryEntry,
      cloneStateForHistory,
      saveState,
      renderAll,
      renderTree,
      dirtyDocIds,
    } = deps;

    function getFolder(folderId) {
      return state.folders.find((f) => f.id === folderId);
    }

    function getDescendantFolderIds(folderId) {
      const result = [];
      const stack = [folderId];
      while (stack.length > 0) {
        const current = stack.pop();
        const children = state.folders.filter((f) => (f.parentFolderId || null) === current);
        children.forEach((c) => {
          result.push(c.id);
          stack.push(c.id);
        });
      }
      return result;
    }

    function ensureAtLeastOneDoc() {
      if (state.docs.length > 0) return;
      if (state.folders.length > 0) {
        state.activeDocA = null;
        state.activeDocB = null;
        return;
      }
      const id = `d${Date.now()}`;
      state.docs.push({ id, name: '새 문서.txt', folderId: null, content: '' });
      state.activeDocA = id;
      state.activeDocB = null;
    }

    async function renameDoc(docId) {
      const doc = getDoc(docId);
      if (!doc) return;
      const name = await openInputDialog({
        title: '문서 이름 변경',
        message: '새 문서 이름을 입력하세요.',
        defaultValue: doc.name,
        confirmText: '변경',
        cancelText: '취소',
      });
      if (!name || !name.trim()) return;
      doc.name = name.trim();
      saveState();
      renderAll();
    }

    async function renameFolder(folderId) {
      const folder = getFolder(folderId);
      if (!folder) return;
      const name = await openInputDialog({
        title: '폴더 이름 변경',
        message: '새 폴더 이름을 입력하세요.',
        defaultValue: folder.name,
        confirmText: '변경',
        cancelText: '취소',
      });
      if (!name || !name.trim()) return;
      folder.name = name.trim();
      saveState();
      renderTree();
    }

    async function deleteDoc(docId) {
      const doc = getDoc(docId);
      if (!doc) return;
      const shouldDelete = await openConfirmDialog({
        title: '문서 삭제 확인',
        message: `문서 "${doc.name}"를 삭제할까요?`,
        confirmText: '삭제',
        cancelText: '취소',
        danger: true,
      });
      if (!shouldDelete) return;
      addHistoryEntry('doc-delete', {
        scope: 'doc',
        docId: doc.id,
        docName: doc.name,
        summary: `문서 삭제: ${doc.name}`,
      }, cloneStateForHistory());

      state.docs = state.docs.filter((d) => d.id !== docId);
      dirtyDocIds.delete(docId);

      if (state.activeDocA === docId) state.activeDocA = null;
      if (state.activeDocB === docId) state.activeDocB = null;
      ensureAtLeastOneDoc();
      if (!state.activeDocA && state.docs[0]) state.activeDocA = state.docs[0].id;
      if (state.activeDocA === state.activeDocB) state.activeDocB = null;

      saveState();
      renderAll();
    }

    async function deleteFolder(folderId) {
      const folder = getFolder(folderId);
      if (!folder) return;
      const folderIds = [folderId, ...getDescendantFolderIds(folderId)];
      const docsInFolders = state.docs.filter((d) => folderIds.includes(d.folderId));
      const msg = `폴더 "${folder.name}" 및 하위 폴더/문서 ${docsInFolders.length}개를 삭제할까요?`;
      const shouldDelete = await openConfirmDialog({
        title: '폴더 삭제 확인',
        message: msg,
        confirmText: '삭제',
        cancelText: '취소',
        danger: true,
      });
      if (!shouldDelete) return;
      addHistoryEntry('folder-delete', {
        scope: 'folder',
        summary: `폴더 삭제: ${folder.name} (문서 ${docsInFolders.length}개 포함)`,
      }, cloneStateForHistory());

      state.folders = state.folders.filter((f) => !folderIds.includes(f.id));
      state.docs = state.docs.filter((d) => !folderIds.includes(d.folderId));
      docsInFolders.forEach((d) => {
        dirtyDocIds.delete(d.id);
      });

      if (state.activeDocA && !getDoc(state.activeDocA)) state.activeDocA = null;
      if (state.activeDocB && !getDoc(state.activeDocB)) state.activeDocB = null;
      ensureAtLeastOneDoc();
      if (!state.activeDocA && state.docs[0]) state.activeDocA = state.docs[0].id;
      if (state.activeDocA === state.activeDocB) state.activeDocB = null;

      saveState();
      renderAll();
    }

    function moveDocToFolder(docId, folderId) {
      const doc = getDoc(docId);
      if (!doc) return;
      if (doc.folderId === folderId) return;
      doc.folderId = folderId;
      saveState();
      renderTree();
    }

    async function moveFolderToFolder(folderId, targetParentId) {
      const folder = getFolder(folderId);
      if (!folder) return;
      if (folderId === targetParentId) return;
      if (targetParentId && getDescendantFolderIds(folderId).includes(targetParentId)) {
        await openNoticeDialog({
          title: '이동 불가',
          message: '하위 폴더 안으로는 이동할 수 없습니다.',
        });
        return;
      }
      folder.parentFolderId = targetParentId;
      saveState();
      renderTree();
    }

    async function createDoc(folderId) {
      const name = await openInputDialog({
        title: '문서 생성',
        message: '새 문서 이름을 입력하세요.',
        defaultValue: '새 문서.txt',
        confirmText: '생성',
        cancelText: '취소',
      });
      if (!name || !name.trim()) return;
      const id = `d${Date.now()}`;
      const nextName = name.trim();
      state.docs.push({ id, name: nextName, folderId, content: '' });
      state.activeDocA = id;
      addHistoryEntry('doc-create', {
        scope: 'doc',
        docId: id,
        docName: nextName,
        summary: `문서 생성: ${nextName}`,
      });
      saveState();
      renderAll();
    }

    async function createFolder(parentFolderId = null) {
      const name = await openInputDialog({
        title: '폴더 생성',
        message: '새 폴더 이름을 입력하세요.',
        defaultValue: '새 폴더',
        confirmText: '생성',
        cancelText: '취소',
      });
      if (!name || !name.trim()) return;
      const nextName = name.trim();
      state.folders.push({ id: `f${Date.now()}`, name: nextName, parentFolderId });
      addHistoryEntry('folder-create', {
        scope: 'folder',
        summary: `폴더 생성: ${nextName}`,
      });
      saveState();
      renderTree();
    }

    return {
      getFolder,
      getDescendantFolderIds,
      ensureAtLeastOneDoc,
      renameDoc,
      renameFolder,
      deleteDoc,
      deleteFolder,
      moveDocToFolder,
      moveFolderToFolder,
      createDoc,
      createFolder,
    };
  }

  return {
    createTreeActions,
  };
}));
