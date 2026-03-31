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

