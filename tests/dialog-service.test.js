const assert = require('assert');
const path = require('path');

const dialogService = require(path.join(__dirname, '..', 'dialog-service.js'));

function createDialog() {
  return {
    open: false,
    oncancel: null,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
}

function createButton() {
  return {
    textContent: '',
    onclick: null,
    classList: {
      toggle() {},
    },
  };
}

async function testConfirmDialog() {
  const nodes = {
    'confirm-dialog': createDialog(),
    'confirm-dialog-title': { textContent: '' },
    'confirm-dialog-message': { textContent: '' },
    'confirm-dialog-cancel-btn': createButton(),
    'confirm-dialog-confirm-btn': createButton(),
  };
  const api = dialogService.createDialogApi({ getById: (id) => nodes[id] || null });

  const p = api.confirm({ title: 't', message: 'm', danger: true });
  nodes['confirm-dialog-confirm-btn'].onclick();
  const result = await p;
  assert.strictEqual(result, true);
  assert.strictEqual(nodes['confirm-dialog'].open, false);
}

async function testInputDialog() {
  const nodes = {
    'input-dialog': createDialog(),
    'input-dialog-title': { textContent: '' },
    'input-dialog-message': { textContent: '' },
    'input-dialog-value': {
      value: '',
      placeholder: '',
      focus() {},
      select() {},
    },
    'input-dialog-cancel-btn': createButton(),
    'input-dialog-confirm-btn': createButton(),
  };
  const api = dialogService.createDialogApi({ getById: (id) => nodes[id] || null });

  const p = api.input({ defaultValue: 'hello' });
  nodes['input-dialog-value'].value = 'world';
  nodes['input-dialog-confirm-btn'].onclick();
  const result = await p;
  assert.strictEqual(result, 'world');
}

async function testNoticeDialog() {
  const nodes = {
    'notice-dialog': createDialog(),
    'notice-dialog-title': { textContent: '' },
    'notice-dialog-message': { textContent: '' },
    'notice-dialog-close-btn': createButton(),
  };
  const api = dialogService.createDialogApi({ getById: (id) => nodes[id] || null });

  const p = api.notice({ title: 'notice' });
  nodes['notice-dialog-close-btn'].onclick();
  await p;
  assert.strictEqual(nodes['notice-dialog'].open, false);
}

async function testChoiceDialog() {
  const nodes = {
    'choice-dialog': createDialog(),
    'choice-dialog-title': { textContent: '' },
    'choice-dialog-message': { textContent: '' },
    'choice-dialog-primary-btn': createButton(),
    'choice-dialog-secondary-btn': createButton(),
    'choice-dialog-cancel-btn': createButton(),
  };
  const api = dialogService.createDialogApi({ getById: (id) => nodes[id] || null });

  const p = api.choice({
    choices: {
      primary: { label: 'a', value: 'overwrite_remote' },
      secondary: { label: 'b', value: 'keep_remote' },
      cancel: { label: 'c', value: 'cancel' },
    },
  });
  nodes['choice-dialog-secondary-btn'].onclick();
  const result = await p;
  assert.strictEqual(result, 'keep_remote');
}

async function run() {
  await testConfirmDialog();
  await testInputDialog();
  await testNoticeDialog();
  await testChoiceDialog();
  console.log('dialog-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
