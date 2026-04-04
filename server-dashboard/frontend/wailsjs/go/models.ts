export namespace main {
	
	export class DBAnnouncement {
	    id: string;
	    school_id: string;
	    title: string;
	    content: string;
	    type: string;
	    is_urgent: boolean;
	    markdown_content: string;
	    attachments_json: string;
	    created_by: string;
	    created_by_name: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new DBAnnouncement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.school_id = source["school_id"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.type = source["type"];
	        this.is_urgent = source["is_urgent"];
	        this.markdown_content = source["markdown_content"];
	        this.attachments_json = source["attachments_json"];
	        this.created_by = source["created_by"];
	        this.created_by_name = source["created_by_name"];
	        this.created_at = source["created_at"];
	    }
	}
	export class DBKnowledgeDoc {
	    id: string;
	    school_id: string;
	    title: string;
	    source_type: string;
	    original_filename: string;
	    file_url: string;
	    markdown_content: string;
	    created_by: string;
	    created_by_name: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new DBKnowledgeDoc(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.school_id = source["school_id"];
	        this.title = source["title"];
	        this.source_type = source["source_type"];
	        this.original_filename = source["original_filename"];
	        this.file_url = source["file_url"];
	        this.markdown_content = source["markdown_content"];
	        this.created_by = source["created_by"];
	        this.created_by_name = source["created_by_name"];
	        this.created_at = source["created_at"];
	    }
	}
	export class DBUser {
	    id: string;
	    school_id: string;
	    school_name: string;
	    name: string;
	    phone: string;
	    role: string;
	    grade: number;
	    class_num: number;
	    number: number;
	    gender: string;
	    position: string;
	    student_name: string;
	    is_active: boolean;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new DBUser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.school_id = source["school_id"];
	        this.school_name = source["school_name"];
	        this.name = source["name"];
	        this.phone = source["phone"];
	        this.role = source["role"];
	        this.grade = source["grade"];
	        this.class_num = source["class_num"];
	        this.number = source["number"];
	        this.gender = source["gender"];
	        this.position = source["position"];
	        this.student_name = source["student_name"];
	        this.is_active = source["is_active"];
	        this.created_at = source["created_at"];
	    }
	}
	export class DependencyStatus {
	    postgres: boolean;
	    redis: boolean;
	    minio: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DependencyStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.postgres = source["postgres"];
	        this.redis = source["redis"];
	        this.minio = source["minio"];
	    }
	}
	export class ServerStatus {
	    isRunning: boolean;
	    uptime: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isRunning = source["isRunning"];
	        this.uptime = source["uptime"];
	    }
	}

}

