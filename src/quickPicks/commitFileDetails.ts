'use strict';
import { Arrays, Iterables, Strings } from '../system';
import { QuickPickItem, QuickPickOptions, Uri, window } from 'vscode';
import { Commands, CopyMessageToClipboardCommandArgs, CopyShaToClipboardCommandArgs, DiffWithPreviousCommandArgs, DiffWithWorkingCommandArgs, ShowQuickCommitDetailsCommandArgs, ShowQuickCommitFileDetailsCommandArgs, ShowQuickFileHistoryCommandArgs } from '../commands';
import { CommandQuickPickItem, getQuickPickIgnoreFocusOut, KeyCommandQuickPickItem, OpenFileCommandQuickPickItem } from './common';
import { GlyphChars } from '../constants';
import { GitBranch, GitLog, GitLogCommit, GitService, GitUri, RemoteResource } from '../gitService';
import { Keyboard, KeyCommand, KeyNoopCommand } from '../keyboard';
import { OpenRemotesCommandQuickPickItem } from './remotes';
import * as moment from 'moment';
import * as path from 'path';

export class OpenCommitFileCommandQuickPickItem extends OpenFileCommandQuickPickItem {

    constructor(commit: GitLogCommit, item?: QuickPickItem) {
        let description: string;
        let uri: Uri;
        if (commit.status === 'D') {
            uri = GitService.toGitContentUri(commit.previousSha!, commit.previousShortSha!, commit.previousFileName!, commit.repoPath, undefined);
            description = `${Strings.pad(GlyphChars.Dash, 2, 3)} ${path.basename(commit.fileName)} in ${GlyphChars.Space}$(git-commit) ${commit.previousShortSha} (deleted in ${GlyphChars.Space}$(git-commit) ${commit.shortSha})`;
        }
        else {
            uri = GitService.toGitContentUri(commit);
            description = `${Strings.pad(GlyphChars.Dash, 2, 3)} ${path.basename(commit.fileName)} in ${GlyphChars.Space}$(git-commit) ${commit.shortSha}`;
        }
        super(uri, item || {
            label: `$(file-symlink-file) Open File`,
            description: description
        });
    }
}

export class OpenCommitWorkingTreeFileCommandQuickPickItem extends OpenFileCommandQuickPickItem {

    constructor(commit: GitLogCommit, item?: QuickPickItem) {
        const uri = Uri.file(path.resolve(commit.repoPath, commit.fileName));
        super(uri, item || {
            label: `$(file-symlink-file) Open Working File`,
            description: `${Strings.pad(GlyphChars.Dash, 2, 3)} ${path.basename(commit.fileName)}`
        });
    }
}

export class CommitFileDetailsQuickPick {

    static async show(git: GitService, commit: GitLogCommit, uri: Uri, goBackCommand?: CommandQuickPickItem, currentCommand?: CommandQuickPickItem, fileLog?: GitLog): Promise<CommandQuickPickItem | undefined> {
        const items: CommandQuickPickItem[] = [];

        const stash = commit.type === 'stash';

        const workingName = (commit.workingFileName && path.basename(commit.workingFileName)) || path.basename(commit.fileName);

        const isUncommitted = commit.isUncommitted;
        if (isUncommitted) {
            // Since we can't trust the previous sha on an uncommitted commit, find the last commit for this file
            const c = await git.getLogCommit(undefined, commit.uri.fsPath, { previous: true });
            if (c === undefined) return undefined;

            commit = c;
        }

        if (!stash) {
            items.push(new CommandQuickPickItem({
                label: `$(git-commit) Show Commit Details`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} $(git-commit) ${commit.shortSha}`
            }, Commands.ShowQuickCommitDetails, [
                    new GitUri(commit.uri, commit),
                    {
                        commit,
                        sha: commit.sha,
                        goBackCommand: currentCommand
                    } as ShowQuickCommitDetailsCommandArgs
                ]));

            if (commit.previousSha) {
                items.push(new CommandQuickPickItem({
                    label: `$(git-compare) Compare File with Previous`,
                    description: `${Strings.pad(GlyphChars.Dash, 2, 3)} $(git-commit) ${commit.previousShortSha} ${GlyphChars.Space} $(git-compare) ${GlyphChars.Space} $(git-commit) ${commit.shortSha}`
                }, Commands.DiffWithPrevious, [
                        commit.uri,
                        {
                            commit
                        } as DiffWithPreviousCommandArgs
                    ]));
            }
        }

        if (commit.workingFileName) {
            items.push(new CommandQuickPickItem({
                label: `$(git-compare) Compare File with Working Tree`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} $(git-commit) ${commit.shortSha} ${GlyphChars.Space} $(git-compare) ${GlyphChars.Space} $(file-text) ${workingName}`
            }, Commands.DiffWithWorking, [
                    Uri.file(path.resolve(commit.repoPath, commit.workingFileName)),
                    {
                        commit
                    } as DiffWithWorkingCommandArgs
                ]));
        }

        if (!stash) {
            items.push(new CommandQuickPickItem({
                label: `$(clippy) Copy Commit ID to Clipboard`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} ${commit.shortSha}`
            }, Commands.CopyShaToClipboard, [
                    uri,
                    {
                        sha: commit.sha
                    } as CopyShaToClipboardCommandArgs
                ]));

            items.push(new CommandQuickPickItem({
                label: `$(clippy) Copy Message to Clipboard`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} ${commit.message}`
            }, Commands.CopyMessageToClipboard, [
                    uri,
                    {
                        message: commit.message,
                        sha: commit.sha
                    } as CopyMessageToClipboardCommandArgs
                ]));
        }

        items.push(new OpenCommitFileCommandQuickPickItem(commit));
        if (commit.workingFileName && commit.status !== 'D') {
            items.push(new OpenCommitWorkingTreeFileCommandQuickPickItem(commit));
        }

        const remotes = Arrays.uniqueBy(await git.getRemotes(commit.repoPath), _ => _.url, _ => !!_.provider);
        if (remotes.length) {
            if (!stash) {
                items.push(new OpenRemotesCommandQuickPickItem(remotes, {
                    type: 'file',
                    fileName: commit.fileName,
                    commit
                } as RemoteResource, currentCommand));
            }
            if (commit.workingFileName && commit.status !== 'D') {
                const branch = await git.getBranch(commit.repoPath || git.repoPath) as GitBranch;
                items.push(new OpenRemotesCommandQuickPickItem(remotes, {
                    type: 'working-file',
                    fileName: commit.workingFileName,
                    branch: branch.name
                } as RemoteResource, currentCommand));
            }
        }

        if (commit.workingFileName) {
            items.push(new CommandQuickPickItem({
                label: `$(history) Show File History`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} of ${path.basename(commit.fileName)}`
            }, Commands.ShowQuickFileHistory, [
                    Uri.file(path.resolve(commit.repoPath, commit.workingFileName)),
                    {
                        fileLog,
                        goBackCommand: currentCommand
                    } as ShowQuickFileHistoryCommandArgs
                ]));
        }

        if (!stash) {
            items.push(new CommandQuickPickItem({
                label: `$(history) Show ${commit.workingFileName ? 'Previous ' : ''}File History`,
                description: `${Strings.pad(GlyphChars.Dash, 2, 3)} of ${path.basename(commit.fileName)} ${Strings.pad(GlyphChars.Dot, 1, 1)} from ${GlyphChars.Space}$(git-commit) ${commit.shortSha}`
            }, Commands.ShowQuickFileHistory, [
                    new GitUri(commit.uri, commit),
                    {
                        goBackCommand: currentCommand
                    } as ShowQuickFileHistoryCommandArgs
                ]));
        }

        if (goBackCommand) {
            items.splice(0, 0, goBackCommand);
        }

        let previousCommand: KeyCommand | (() => Promise<KeyCommand>) | undefined = undefined;
        let nextCommand: KeyCommand | (() => Promise<KeyCommand>) | undefined = undefined;
        if (!stash) {
            // If we have the full history, we are good
            if (fileLog !== undefined && !fileLog.truncated && fileLog.sha === undefined) {
                previousCommand = commit.previousSha === undefined
                    ? undefined
                    : new KeyCommandQuickPickItem(Commands.ShowQuickCommitFileDetails, [
                        commit.previousUri,
                        {
                            fileLog,
                            sha: commit.previousSha,
                            goBackCommand
                        } as ShowQuickCommitFileDetailsCommandArgs
                    ]);

                nextCommand = commit.nextSha === undefined
                    ? undefined
                    : new KeyCommandQuickPickItem(Commands.ShowQuickCommitFileDetails, [
                        commit.nextUri,
                        {
                            fileLog,
                            sha: commit.nextSha,
                            goBackCommand
                        } as ShowQuickCommitFileDetailsCommandArgs
                    ]);
            }
            else {
                previousCommand = async () => {
                    let log = fileLog;
                    let c = log && log.commits.get(commit.sha);

                    // If we can't find the commit or the previous commit isn't available (since it isn't trustworthy)
                    if (c === undefined || c.previousSha === undefined) {
                        log = await git.getLogForFile(commit.repoPath, uri.fsPath, commit.sha, { maxCount: git.config.advanced.maxQuickHistory });
                        if (log === undefined) return KeyNoopCommand;

                        c = log && log.commits.get(commit.sha);
                        // Since we exclude merge commits in file log, just grab the first returned commit
                        if (c === undefined && commit.isMerge) {
                            c = Iterables.first(log.commits.values());
                        }

                        if (c) {
                            // Copy over next info, since it is trustworthy at this point
                            c.nextSha = commit.nextSha;
                            c.nextFileName = commit.nextFileName;
                        }
                    }

                    if (c === undefined || c.previousSha === undefined) return KeyNoopCommand;

                    return new KeyCommandQuickPickItem(Commands.ShowQuickCommitFileDetails, [
                        c.previousUri,
                        {
                            fileLog: log,
                            sha: c.previousSha,
                            goBackCommand
                        } as ShowQuickCommitFileDetailsCommandArgs
                    ]);
                };

                nextCommand = async () => {
                    let log = fileLog;
                    let c = log && log.commits.get(commit.sha);

                    // If we can't find the commit or the next commit isn't available (since it isn't trustworthy)
                    if (c === undefined || c.nextSha === undefined) {
                        log = undefined;
                        c = undefined;

                        // Try to find the next commit
                        const next = await git.findNextCommit(commit.repoPath, uri.fsPath, commit.sha);
                        if (next !== undefined && next.sha !== commit.sha) {
                            c = commit;
                            c.nextSha = next.sha;
                            c.nextFileName = next.originalFileName || next.fileName;
                        }
                    }

                    if (c === undefined || c.nextSha === undefined) return KeyNoopCommand;

                    return new KeyCommandQuickPickItem(Commands.ShowQuickCommitFileDetails, [
                        c.nextUri,
                        {
                            fileLog: log,
                            sha: c.nextSha,
                            goBackCommand
                        } as ShowQuickCommitFileDetailsCommandArgs
                    ]);
                };
            }
        }

        const scope = await Keyboard.instance.beginScope({
            left: goBackCommand,
            ',': previousCommand,
            '.': nextCommand
        });

        const pick = await window.showQuickPick(items, {
            matchOnDescription: true,
            placeHolder: `${commit.getFormattedPath()} ${Strings.pad(GlyphChars.Dot, 1, 1)} ${isUncommitted ? `Uncommitted ${GlyphChars.ArrowRightHollow} ` : '' }${commit.shortSha} ${Strings.pad(GlyphChars.Dot, 1, 1)} ${commit.author}, ${moment(commit.date).fromNow()} ${Strings.pad(GlyphChars.Dot, 1, 1)} ${commit.message}`,
            ignoreFocusOut: getQuickPickIgnoreFocusOut(),
            onDidSelectItem: (item: QuickPickItem) => {
                scope.setKeyCommand('right', item as KeyCommand);
            }
        } as QuickPickOptions);

        await scope.dispose();

        return pick;
    }
}