'use strict';
import { Arrays } from '../system';
import { commands, TextEditor, Uri, window } from 'vscode';
import { ActiveEditorCommand, CommandContext, Commands, getCommandUri } from './common';
import { GitBlameCommit, GitService, GitUri } from '../gitService';
import { Logger } from '../logger';
import { Messages } from '../messages';
import { OpenInRemoteCommandArgs } from './openInRemote';
import { CommitNode } from '../views/explorerNodes';

export interface OpenCommitInRemoteCommandArgs {
    sha?: string;
}

export class OpenCommitInRemoteCommand extends ActiveEditorCommand {

    constructor(private git: GitService) {
        super(Commands.OpenCommitInRemote);
    }

    protected async preExecute(context: CommandContext, args: OpenCommitInRemoteCommandArgs = {}): Promise<any> {
        if (context.type === 'view' && context.node instanceof CommitNode) {
            args = { ...args };
            args.sha = context.node.commit.sha;
            return this.execute(context.editor, context.node.commit.uri, args);
        }

        return this.execute(context.editor, context.uri, args);
    }

    async execute(editor?: TextEditor, uri?: Uri, args: OpenCommitInRemoteCommandArgs = {}) {
        uri = getCommandUri(uri, editor);
        if (uri === undefined) return undefined;
        if (editor !== undefined && editor.document !== undefined && editor.document.isDirty) return undefined;

        const gitUri = await GitUri.fromUri(uri, this.git);
        if (!gitUri.repoPath) return undefined;

        try {
            if (args.sha === undefined) {
                const line = editor === undefined ? gitUri.offset : editor.selection.active.line;
                const blameline = line - gitUri.offset;
                if (blameline < 0) return undefined;

                const blame = await this.git.getBlameForLine(gitUri, blameline);
                if (blame === undefined) return Messages.showFileNotUnderSourceControlWarningMessage('Unable to open commit in remote provider');

                let commit = blame.commit;
                // If the line is uncommitted, find the previous commit
                if (commit.isUncommitted) {
                    commit = new GitBlameCommit(commit.repoPath, commit.previousSha!, commit.previousFileName!, commit.author, commit.date, commit.message, []);
                }

                args.sha = commit.sha;
            }

            const remotes = Arrays.uniqueBy(await this.git.getRemotes(gitUri.repoPath), _ => _.url, _ => !!_.provider);
            return commands.executeCommand(Commands.OpenInRemote, uri, {
                resource: {
                    type: 'commit',
                    sha: args.sha
                },
                remotes
            } as OpenInRemoteCommandArgs);
        }
        catch (ex) {
            Logger.error(ex, 'OpenCommitInRemoteCommand');
            return window.showErrorMessage(`Unable to open commit in remote provider. See output channel for more details`);
        }
    }
}