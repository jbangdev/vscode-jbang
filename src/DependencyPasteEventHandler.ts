import { XMLParser } from "fast-xml-parser";
import { CancellationToken, DataTransfer, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteProviderMetadata, ExtensionContext, languages, Range, TextDocument } from "vscode";
import { isJBangFile, SUPPORTED_LANGUAGES } from "./JBangUtils";

const TEXT_MIMETYPE: string = "text/plain";
const MIMETYPES: DocumentPasteProviderMetadata = {
	id: 'JBangPasteProvider',
	pasteMimeTypes: [TEXT_MIMETYPE]
};

/**
 * `DocumentPasteEditProvider` that converts Maven's XML dependencies to matching JBang //DEPS
 */
export class DependencyPasteEditProvider implements DocumentPasteEditProvider {

	async provideDocumentPasteEdits(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): Promise<DocumentPasteEdit | undefined> {
		if (!isJBangFile(document.getText())){
			return undefined;
		}
		const pasteContent = dataTransfer.get(TEXT_MIMETYPE);
		if (!pasteContent) {
			return undefined;
		}
		const pastedText: string = (await pasteContent.asString()).trim();

		// don't try to provide for multi character inserts; the implementation will get messy and the feature won't be that helpful
		if (!pastedText || token.isCancellationRequested || ranges.length !== 1) {
			return undefined;
		}

		const range = ranges[0];
		if (range.start.character > 0) {
			//Only paste on the 1st column, for now
			return undefined;
		}
		const line = range.start.line;
		const targetLine = document.lineAt(line);
		if (!targetLine.isEmptyOrWhitespace) {
			return undefined;
		}
		let dependencies:any;
		let xml: any;
		if (pastedText.startsWith("<dependency>") 
		|| pastedText.startsWith("<dependencies>") 
		|| pastedText.startsWith("<dependencyManagement>")) {
			xml = new XMLParser().parse(pastedText);
			if (xml.dependency) {
				dependencies = xml.dependency;
			} else if (xml.dependencies?.dependency) {
				dependencies = xml.dependencies.dependency;
			} else if (xml.dependencyManagement?.dependencies?.dependency) {
				dependencies = xml.dependencyManagement.dependencies.dependency;
			}
		}

		if (!dependencies) {
			return undefined;
		}
		let convertedDependencies: string | undefined;

		if (Array.isArray(dependencies)){
			convertedDependencies = dependencies.map(d => this.toJBangDependency(d)).filter(d => d !== undefined).join('\n');
		} else {
			convertedDependencies = this.toJBangDependency(dependencies);
		}
		if (convertedDependencies) {
			return new DocumentPasteEdit(convertedDependencies, "Paste as JBang //DEPS");
		}
		// either the handler returns null or encounters problems, fall back to return undefined to let VS Code ignore this handler
		return undefined;
	}


	private toJBangDependency(dependency: any): string | undefined  {
		if (!dependency.groupId || !dependency.artifactId) {
			return undefined;
		}
		const suffix = dependency?.type === 'pom'? '@pom':'';
		const version = dependency?.version ? dependency.version: "LATEST";
		return `//DEPS ${dependency.groupId}:${dependency.artifactId}:${version}${suffix}`;
	}

	/**
	 * Registers the DependencyPasteEditProvider and sets it up to be disposed.
	 *
	 * @param context the extension context
	 */
	public initialize(context: ExtensionContext) {
		if (languages.registerDocumentPasteEditProvider) {
			const dependencyPasteEditProvider = new DependencyPasteEditProvider();
			SUPPORTED_LANGUAGES.forEach(languageId => {
				context.subscriptions.push(
					languages.registerDocumentPasteEditProvider(languageId, dependencyPasteEditProvider, MIMETYPES)
				);
			});
		}
	}
}

export default new DependencyPasteEditProvider();