export namespace main {
	
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

