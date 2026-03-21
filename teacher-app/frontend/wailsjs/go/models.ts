export namespace main {
	
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

}

