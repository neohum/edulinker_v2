export namespace main {
	
	export class AIBenchmark {
	    hostname: string;
	    ip_address: string;
	    cpu_name: string;
	    cpu_cores: number;
	    cpu_threads: number;
	    ram_total_gb: number;
	    ram_free_gb: number;
	    gpu_name: string;
	    gpu_memory_mb: number;
	    disk_free_gb: number;
	    mac_address: string;
	    cpu_score: number;
	    ram_score: number;
	    gpu_score: number;
	    disk_score: number;
	    grade: number;
	    grade_label: string;
	    grade_desc: string;
	    recomm_model: string;
	    printers: string[];
	    monitors: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIBenchmark(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hostname = source["hostname"];
	        this.ip_address = source["ip_address"];
	        this.cpu_name = source["cpu_name"];
	        this.cpu_cores = source["cpu_cores"];
	        this.cpu_threads = source["cpu_threads"];
	        this.ram_total_gb = source["ram_total_gb"];
	        this.ram_free_gb = source["ram_free_gb"];
	        this.gpu_name = source["gpu_name"];
	        this.gpu_memory_mb = source["gpu_memory_mb"];
	        this.disk_free_gb = source["disk_free_gb"];
	        this.mac_address = source["mac_address"];
	        this.cpu_score = source["cpu_score"];
	        this.ram_score = source["ram_score"];
	        this.gpu_score = source["gpu_score"];
	        this.disk_score = source["disk_score"];
	        this.grade = source["grade"];
	        this.grade_label = source["grade_label"];
	        this.grade_desc = source["grade_desc"];
	        this.recomm_model = source["recomm_model"];
	        this.printers = source["printers"];
	        this.monitors = source["monitors"];
	    }
	}
	export class AILog {
	    id: string;
	    prompt_type: string;
	    input_data: string;
	    generated_content: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new AILog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.prompt_type = source["prompt_type"];
	        this.input_data = source["input_data"];
	        this.generated_content = source["generated_content"];
	        this.created_at = source["created_at"];
	    }
	}
	export class AttendanceRecord {
	    id: string;
	    student_id: string;
	    date: string;
	    absence_type: string;
	    remark: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new AttendanceRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.student_id = source["student_id"];
	        this.date = source["date"];
	        this.absence_type = source["absence_type"];
	        this.remark = source["remark"];
	        this.created_at = source["created_at"];
	    }
	}
	export class Bookmark {
	    id: string;
	    title: string;
	    url: string;
	    student_url: string;
	    category: string;
	    is_shared: boolean;
	    share_teachers: boolean;
	    share_class: boolean;
	    target_ids: string;
	    is_own: boolean;
	    sort_order: number;
	
	    static createFrom(source: any = {}) {
	        return new Bookmark(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.url = source["url"];
	        this.student_url = source["student_url"];
	        this.category = source["category"];
	        this.is_shared = source["is_shared"];
	        this.share_teachers = source["share_teachers"];
	        this.share_class = source["share_class"];
	        this.target_ids = source["target_ids"];
	        this.is_own = source["is_own"];
	        this.sort_order = source["sort_order"];
	    }
	}
	export class ConvertToMarkdownResult {
	    success: boolean;
	    text: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConvertToMarkdownResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.text = source["text"];
	        this.error = source["error"];
	    }
	}
	export class CounselingRecord {
	    id: string;
	    student_id: string;
	    date: string;
	    type: string;
	    content: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new CounselingRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.student_id = source["student_id"];
	        this.date = source["date"];
	        this.type = source["type"];
	        this.content = source["content"];
	        this.created_at = source["created_at"];
	    }
	}
	export class DownloadFileResult {
	    success: boolean;
	    file_path?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.file_path = source["file_path"];
	        this.error = source["error"];
	    }
	}
	export class DraftListItem {
	    id: string;
	    title: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new DraftListItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class EvalRecord {
	    id: string;
	    student_id: string;
	    subject: string;
	    evaluation_type: string;
	    score: number;
	    grade: string;
	    feedback: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new EvalRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.student_id = source["student_id"];
	        this.subject = source["subject"];
	        this.evaluation_type = source["evaluation_type"];
	        this.score = source["score"];
	        this.grade = source["grade"];
	        this.feedback = source["feedback"];
	        this.created_at = source["created_at"];
	    }
	}
	export class GetConvertedPageResult {
	    success: boolean;
	    base64: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new GetConvertedPageResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.base64 = source["base64"];
	        this.error = source["error"];
	    }
	}
	export class HwpConvertResult {
	    success: boolean;
	    file_name: string;
	    data: string;
	    size: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new HwpConvertResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.file_name = source["file_name"];
	        this.data = source["data"];
	        this.size = source["size"];
	        this.error = source["error"];
	    }
	}
	export class HwpPagesResult {
	    success: boolean;
	    pages: string[];
	    page_count: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new HwpPagesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.pages = source["pages"];
	        this.page_count = source["page_count"];
	        this.error = source["error"];
	    }
	}
	export class HwpTextResult {
	    success: boolean;
	    text: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new HwpTextResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.text = source["text"];
	        this.error = source["error"];
	    }
	}
	export class KnowledgeDocUser {
	    name: string;
	    grade: number;
	    class_num: number;
	
	    static createFrom(source: any = {}) {
	        return new KnowledgeDocUser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.grade = source["grade"];
	        this.class_num = source["class_num"];
	    }
	}
	export class KnowledgeDoc {
	    id: string;
	    title: string;
	    source_type: string;
	    original_filename: string;
	    file_url: string;
	    markdown_content: string;
	    created_at: string;
	    user?: KnowledgeDocUser;
	
	    static createFrom(source: any = {}) {
	        return new KnowledgeDoc(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.source_type = source["source_type"];
	        this.original_filename = source["original_filename"];
	        this.file_url = source["file_url"];
	        this.markdown_content = source["markdown_content"];
	        this.created_at = source["created_at"];
	        this.user = this.convertValues(source["user"], KnowledgeDocUser);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LocalAnnouncement {
	    id: string;
	    type: string;
	    title: string;
	    content: string;
	    is_urgent: boolean;
	    target_roles: string;
	    created_at: string;
	    author_id: string;
	    is_confirmed: boolean;
	    attachments_json: string;
	    // Go type: struct { Name string "json:\"name\""; ID string "json:\"id\"" }
	    author?: any;
	
	    static createFrom(source: any = {}) {
	        return new LocalAnnouncement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.is_urgent = source["is_urgent"];
	        this.target_roles = source["target_roles"];
	        this.created_at = source["created_at"];
	        this.author_id = source["author_id"];
	        this.is_confirmed = source["is_confirmed"];
	        this.attachments_json = source["attachments_json"];
	        this.author = this.convertValues(source["author"], Object);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LocalDraftMeta {
	    id: string;
	    title: string;
	    fields_json: string;
	    strokes_json: string;
	    target_users_json: string;
	    original_file_name: string;
	    updated_at: string;
	    page_images_base64: string[];
	
	    static createFrom(source: any = {}) {
	        return new LocalDraftMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.fields_json = source["fields_json"];
	        this.strokes_json = source["strokes_json"];
	        this.target_users_json = source["target_users_json"];
	        this.original_file_name = source["original_file_name"];
	        this.updated_at = source["updated_at"];
	        this.page_images_base64 = source["page_images_base64"];
	    }
	}
	export class LoginResult {
	    success: boolean;
	    token: string;
	    refresh_token: string;
	    user_id: string;
	    user_name: string;
	    user_role: string;
	    school_name: string;
	    department: string;
	    task_name: string;
	    class_phone: string;
	    grade: number;
	    class_num: number;
	    error?: string;
	    is_offline?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LoginResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.token = source["token"];
	        this.refresh_token = source["refresh_token"];
	        this.user_id = source["user_id"];
	        this.user_name = source["user_name"];
	        this.user_role = source["user_role"];
	        this.school_name = source["school_name"];
	        this.department = source["department"];
	        this.task_name = source["task_name"];
	        this.class_phone = source["class_phone"];
	        this.grade = source["grade"];
	        this.class_num = source["class_num"];
	        this.error = source["error"];
	        this.is_offline = source["is_offline"];
	    }
	}
	export class OfficeConvertResult {
	    success: boolean;
	    file_name: string;
	    data: string;
	    size: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new OfficeConvertResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.file_name = source["file_name"];
	        this.data = source["data"];
	        this.size = source["size"];
	        this.error = source["error"];
	    }
	}
	export class OllamaStatus {
	    installed: boolean;
	    running: boolean;
	    path?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new OllamaStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.installed = source["installed"];
	        this.running = source["running"];
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	}
	export class OpinionRecord {
	    id: string;
	    student_id: string;
	    content: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new OpinionRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.student_id = source["student_id"];
	        this.content = source["content"];
	        this.created_at = source["created_at"];
	    }
	}
	export class PdfConvertResult {
	    success: boolean;
	    pdf_base64: string;
	    pages: string[];
	    page_count: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PdfConvertResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.pdf_base64 = source["pdf_base64"];
	        this.pages = source["pages"];
	        this.page_count = source["page_count"];
	        this.error = source["error"];
	    }
	}
	export class PluginInfo {
	    id: string;
	    name: string;
	    group_code: string;
	    description: string;
	    enabled: boolean;
	    icon: string;
	
	    static createFrom(source: any = {}) {
	        return new PluginInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.group_code = source["group_code"];
	        this.description = source["description"];
	        this.enabled = source["enabled"];
	        this.icon = source["icon"];
	    }
	}
	export class PullModelResult {
	    success: boolean;
	    model: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PullModelResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.model = source["model"];
	        this.error = source["error"];
	    }
	}
	export class RAGSearchResult {
	    doc_id: string;
	    doc_title: string;
	    source_type: string;
	    display_text: string;
	    heading_context: string;
	    score: number;
	    is_semantic: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RAGSearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.doc_id = source["doc_id"];
	        this.doc_title = source["doc_title"];
	        this.source_type = source["source_type"];
	        this.display_text = source["display_text"];
	        this.heading_context = source["heading_context"];
	        this.score = source["score"];
	        this.is_semantic = source["is_semantic"];
	    }
	}
	export class SchoolResult {
	    name: string;
	    code: string;
	    address: string;
	    region: string;
	
	    static createFrom(source: any = {}) {
	        return new SchoolResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.code = source["code"];
	        this.address = source["address"];
	        this.region = source["region"];
	    }
	}
	export class SendocDraftResult {
	    found: boolean;
	    fields_json: string;
	    strokes_json: string;
	
	    static createFrom(source: any = {}) {
	        return new SendocDraftResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.found = source["found"];
	        this.fields_json = source["fields_json"];
	        this.strokes_json = source["strokes_json"];
	    }
	}
	export class SystemInfo {
	    os: string;
	    arch: string;
	    go_version: string;
	    num_cpu: number;
	
	    static createFrom(source: any = {}) {
	        return new SystemInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.os = source["os"];
	        this.arch = source["arch"];
	        this.go_version = source["go_version"];
	        this.num_cpu = source["num_cpu"];
	    }
	}
	export class TodoItem {
	    id: string;
	    title: string;
	    description: string;
	    scope: string;
	    priority: number;
	    is_completed: boolean;
	    due_date?: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new TodoItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.scope = source["scope"];
	        this.priority = source["priority"];
	        this.is_completed = source["is_completed"];
	        this.due_date = source["due_date"];
	        this.created_at = source["created_at"];
	    }
	}
	export class UploadFileResult {
	    id: string;
	    file_name: string;
	    content_type: string;
	    size: number;
	    url?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new UploadFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.file_name = source["file_name"];
	        this.content_type = source["content_type"];
	        this.size = source["size"];
	        this.url = source["url"];
	        this.error = source["error"];
	    }
	}

}

