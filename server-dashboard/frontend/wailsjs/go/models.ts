export namespace main {
	
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

